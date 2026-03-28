import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import type {
	LoraDatasetDatasetConfig,
	LoraDatasetFeatureConfig,
	LoraDatasetProviderConfig,
} from './schema.js';
import { buildCaptionFromResponseText } from './response-content.js';
import { readLoraDatasetTemplate } from './templates.js';

export { buildCaptionFromResponseText };

type OpenAiChatTextPart = {
	type: 'text';
	text: string;
};

type OpenAiChatImagePart = {
	type: 'image_url';
	image_url: {
		url: string;
	};
};

type OpenAiAssistantContentPart = {
	text?: string;
};

type OpenAiChatResponseMessage = {
	role?: string;
	content?: string | OpenAiAssistantContentPart[];
	reasoning_content?: string | null;
};

export type OpenAiChatCompletionRequest = {
	model: string;
	temperature: number;
	top_p: number;
	max_tokens: number;
	messages: [
		{
			role: 'system';
			content: string;
		},
		{
			role: 'user';
			content: Array<OpenAiChatImagePart | OpenAiChatTextPart>;
		},
	];
};

export type OpenAiChatCompletionResponse = {
	choices?: Array<{
		index?: number;
		message?: OpenAiChatResponseMessage;
		logprobs?: unknown;
		finish_reason?: string | null;
	}>;
	output_text?: string;
	[key: string]: unknown;
};

export class RetryableProviderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RetryableProviderError';
	}
}

export class ProviderFatalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProviderFatalError';
	}
}

export class ProviderParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProviderParseError';
	}
}

export type ProviderCaptionResult = {
	responseText: string;
	parsedPayload?: unknown;
	caption: string;
	rawResponse: OpenAiChatCompletionResponse;
};

function createTimeoutSignal(parent: AbortSignal, timeoutMs: number): {
	signal: AbortSignal;
	dispose: () => void;
} {
	const controller = new AbortController();
	const forwardAbort = () => controller.abort(parent.reason);
	const timeoutId = setTimeout(() => controller.abort(new Error('Request timed out.')), timeoutMs);

	parent.addEventListener('abort', forwardAbort, { once: true });

	return {
		signal: controller.signal,
		dispose: () => {
			clearTimeout(timeoutId);
			parent.removeEventListener('abort', forwardAbort);
		},
	};
}

async function readImageAsDataUrl(options: {
	imagePath: string;
	longEdge: number;
	jpegQuality: number;
}): Promise<string> {
	const resized = await sharp(options.imagePath)
		.rotate()
		.resize({
			width: options.longEdge,
			height: options.longEdge,
			fit: 'inside',
			withoutEnlargement: true,
		})
		.jpeg({ quality: options.jpegQuality })
		.toBuffer();

	return `data:image/jpeg;base64,${resized.toString('base64')}`;
}

function loadSystemPrompt(): string {
	const prompt = readLoraDatasetTemplate('systemPrompt').trim();
	if (prompt.length === 0) {
		throw new Error('Bundled system prompt template is empty.');
	}

	return prompt;
}

/**
"""Build the exact OpenAI-compatible chat completion payload for one caption request.

INTENT: Keep provider request construction explicit, typed, and aligned with the reference lora-tagger contract
INPUT: imageDataUrl, systemPrompt, userPrompt, featureConfig, datasetConfig
OUTPUT: OpenAiChatCompletionRequest
SIDE EFFECT: None
FAILURE: None
"""
 */
export function buildRequestPayload(options: {
	imageDataUrl: string;
	systemPrompt: string;
	userPrompt: string;
	featureConfig: LoraDatasetFeatureConfig;
	datasetConfig: LoraDatasetDatasetConfig;
}): OpenAiChatCompletionRequest {
	return {
		model: options.featureConfig.provider.model,
		temperature: options.datasetConfig.request.temperature,
		top_p: options.datasetConfig.request.topP,
		max_tokens: options.datasetConfig.request.maxOutputTokens,
		messages: [
			{
				role: 'system',
				content: options.systemPrompt,
			},
			{
				role: 'user',
				content: [
					{
						type: 'image_url',
						image_url: {
							url: options.imageDataUrl,
						},
					},
					{
						type: 'text',
						text: options.userPrompt,
					},
				],
			},
		],
	};
}

async function postChatCompletion(options: {
	baseUrl: string;
	apiKey: string;
	payload: OpenAiChatCompletionRequest;
	timeoutSeconds: number;
	abortSignal: AbortSignal;
}): Promise<OpenAiChatCompletionResponse> {
	const timeout = createTimeoutSignal(options.abortSignal, options.timeoutSeconds * 1000);

	try {
		const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${options.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(options.payload),
			signal: timeout.signal,
		});

		const rawText = await response.text();
		if (response.ok) {
			try {
				return JSON.parse(rawText) as OpenAiChatCompletionResponse;
			} catch (error) {
				throw new ProviderParseError(
					`Provider returned invalid JSON response: ${(error as Error).message}`,
				);
			}
		}

		if ([429, 500, 502, 503, 504].includes(response.status)) {
			throw new RetryableProviderError(
				`Provider retryable failure ${response.status}: ${rawText.slice(0, 300)}`,
			);
		}

		throw new ProviderFatalError(
			`Provider request failed ${response.status}: ${rawText.slice(0, 300)}`,
		);
	} catch (error) {
		if (
			error instanceof RetryableProviderError ||
			error instanceof ProviderFatalError ||
			error instanceof ProviderParseError
		) {
			throw error;
		}

		if (error instanceof Error && error.name === 'AbortError' && options.abortSignal.aborted) {
			throw error;
		}

		throw new RetryableProviderError((error as Error).message);
	} finally {
		timeout.dispose();
	}
}

async function requestChatCompletionWithFallback(options: {
	config: LoraDatasetProviderConfig;
	apiKey: string;
	payload: OpenAiChatCompletionRequest;
	timeoutSeconds: number;
	abortSignal: AbortSignal;
}): Promise<OpenAiChatCompletionResponse> {
	const baseUrls = [options.config.baseUrl, options.config.fallbackBaseUrl].filter(
		(value): value is string => typeof value === 'string' && value.length > 0,
	);
	let lastRetryableError: RetryableProviderError | null = null;

	for (const baseUrl of baseUrls) {
		try {
			return await postChatCompletion({
				baseUrl,
				apiKey: options.apiKey,
				payload: options.payload,
				timeoutSeconds: options.timeoutSeconds,
				abortSignal: options.abortSignal,
			});
		} catch (error) {
			if (error instanceof RetryableProviderError) {
				lastRetryableError = error;
				continue;
			}

			throw error;
		}
	}

	if (lastRetryableError) {
		throw lastRetryableError;
	}

	throw new ProviderFatalError('No provider base URL configured.');
}

/**
"""Extract only the assistant-visible content text from a chat completion response.

INTENT: Separate model-facing caption text from raw metadata so captions never include the full API envelope or reasoning traces
INPUT: rawResponse
OUTPUT: assistant content text
SIDE EFFECT: None
FAILURE: Throw ProviderParseError when no assistant-visible content can be found
"""
 */
export function extractAssistantContentText(
	rawResponse: OpenAiChatCompletionResponse,
): string {
	const choices = rawResponse.choices;
	if (Array.isArray(choices) && choices.length > 0) {
		const content = choices[0]?.message?.content;
		if (typeof content === 'string') {
			return content.trim();
		}

		if (Array.isArray(content)) {
			const joined = content
				.map((item) => (typeof item.text === 'string' ? item.text : ''))
				.filter(Boolean)
				.join('\n')
				.trim();

			if (joined.length > 0) {
				return joined;
			}
		}
	}

	const outputText = rawResponse.output_text;
	if (typeof outputText === 'string' && outputText.trim().length > 0) {
		return outputText.trim();
	}

	throw new ProviderParseError('Could not extract text from provider response.');
}

/**
"""Load the user prompt file and return the full prompt text.

INTENT: Read the user-maintained prompt file once for preview and batch execution
INPUT: promptPath
OUTPUT: string
SIDE EFFECT: Read the filesystem
FAILURE: Throw Error when the prompt file is missing, unreadable, or empty
"""
 */
export async function loadUserPrompt(promptPath: string): Promise<string> {
	const prompt = (await readFile(promptPath, 'utf8')).trim();
	if (prompt.length === 0) {
		throw new Error(`User prompt file is empty: ${promptPath}`);
	}

	return prompt;
}

export async function readUserPromptPreview(
	promptPath: string,
	lineCount = 6,
): Promise<string[]> {
	const prompt = await loadUserPrompt(promptPath);
	return prompt.split('\n').slice(0, lineCount);
}

export function readApiKey(
	config: LoraDatasetProviderConfig,
	envSnapshot: Readonly<Record<string, string | undefined>>,
): string {
	const apiKey = envSnapshot[config.apiKeyEnv]?.trim() ?? '';
	if (apiKey.length === 0) {
		throw new ProviderFatalError(
			`Missing required environment variable: ${config.apiKeyEnv}`,
		);
	}

	return apiKey;
}

export function isRetryableProviderError(error: unknown): boolean {
	return error instanceof RetryableProviderError;
}

/**
"""Call the configured vision provider and assemble the final caption text.

INTENT: Unify request building, provider transport, response parsing, and caption fallback behavior across preview and batch
INPUT: imagePath, userPrompt, featureConfig, datasetConfig, apiKey, abortSignal
OUTPUT: ProviderCaptionResult
SIDE EFFECT: Issue one provider request sequence and resize one image for upload
FAILURE: Throw RetryableProviderError, ProviderFatalError, or ProviderParseError when transport or response extraction fails
"""
 */
export async function requestCaptionForImage(options: {
	imagePath: string;
	userPrompt: string;
	featureConfig: LoraDatasetFeatureConfig;
	datasetConfig: LoraDatasetDatasetConfig;
	apiKey: string;
	abortSignal: AbortSignal;
}): Promise<ProviderCaptionResult> {
	const imageDataUrl = await readImageAsDataUrl({
		imagePath: options.imagePath,
		longEdge: options.featureConfig.analysis.longEdge,
		jpegQuality: options.featureConfig.analysis.jpegQuality,
	});
	const payload = buildRequestPayload({
		imageDataUrl,
		systemPrompt: loadSystemPrompt(),
		userPrompt: options.userPrompt,
		featureConfig: options.featureConfig,
		datasetConfig: options.datasetConfig,
	});
	const rawResponse = await requestChatCompletionWithFallback({
		config: options.featureConfig.provider,
		apiKey: options.apiKey,
		payload,
		timeoutSeconds: options.featureConfig.scheduler.timeoutSeconds,
		abortSignal: options.abortSignal,
	});
	const responseText = extractAssistantContentText(rawResponse);
	const captionResult = buildCaptionFromResponseText({
		responseText,
		datasetConfig: options.datasetConfig,
	});

	return {
		responseText,
		parsedPayload: captionResult.parsedPayload,
		caption: captionResult.caption,
		rawResponse,
	};
}

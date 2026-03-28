import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import type {
	LoraDatasetDatasetConfig,
	LoraDatasetFeatureConfig,
	LoraDatasetProviderConfig,
} from './schema.js';

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
	parsedPayload: unknown;
	caption: string;
	rawResponse: unknown;
};

export type ProviderCircuitBreakerState = {
	primaryConsecutiveFailures: number;
	useFallbackForRestOfBatch: boolean;
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

function buildRequestPayload(options: {
	imageDataUrl: string;
	userPrompt: string;
	featureConfig: LoraDatasetFeatureConfig;
	datasetConfig: LoraDatasetDatasetConfig;
}): Record<string, unknown> {
	return {
		model: options.featureConfig.provider.model,
		temperature: options.datasetConfig.request.temperature,
		top_p: options.datasetConfig.request.topP,
		max_tokens: options.datasetConfig.request.maxOutputTokens,
		messages: [
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
	payload: Record<string, unknown>;
	timeoutSeconds: number;
	abortSignal: AbortSignal;
}): Promise<unknown> {
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
			return JSON.parse(rawText);
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
		if (error instanceof RetryableProviderError || error instanceof ProviderFatalError) {
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

function extractResponseText(rawResponse: unknown): string {
	if (typeof rawResponse !== 'object' || rawResponse === null) {
		throw new ProviderParseError('Provider response is not an object.');
	}

	const record = rawResponse as Record<string, unknown>;
	const choices = record.choices;
	if (Array.isArray(choices) && choices.length > 0) {
		const first = choices[0];
		if (typeof first === 'object' && first !== null) {
			const message = (first as Record<string, unknown>).message;
			if (typeof message === 'object' && message !== null) {
				const content = (message as Record<string, unknown>).content;
				if (typeof content === 'string') {
					return content.trim();
				}

				if (Array.isArray(content)) {
					const joined = content
						.map((item) => {
							if (typeof item === 'object' && item !== null) {
								const text = (item as Record<string, unknown>).text;
								return typeof text === 'string' ? text : '';
							}

							return '';
						})
						.filter(Boolean)
						.join('\n')
						.trim();

					if (joined.length > 0) {
						return joined;
					}
				}
			}
		}
	}

	const outputText = record.output_text;
	if (typeof outputText === 'string' && outputText.trim().length > 0) {
		return outputText.trim();
	}

	throw new ProviderParseError('Could not extract text from provider response.');
}

function extractJsonText(responseText: string): string {
	const stripped = responseText.trim();
	if (stripped.startsWith('{') || stripped.startsWith('[')) {
		return stripped;
	}

	const objectMatch = stripped.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
	if (objectMatch?.[1]) {
		return objectMatch[1].trim();
	}

	const firstBrace = stripped.indexOf('{');
	const lastBrace = stripped.lastIndexOf('}');
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		return stripped.slice(firstBrace, lastBrace + 1);
	}

	throw new ProviderParseError('No JSON object found in provider response.');
}

function flattenValue(input: unknown): string[] {
	if (input === null || input === undefined) {
		return [];
	}

	if (Array.isArray(input)) {
		return input.flatMap((item) => flattenValue(item));
	}

	if (typeof input === 'object') {
		return Object.values(input as Record<string, unknown>).flatMap((value) => flattenValue(value));
	}

	const normalized = String(input).trim();
	return normalized.length > 0 ? [normalized] : [];
}

function assembleCaption(options: {
	parsedPayload: unknown;
	datasetConfig: LoraDatasetDatasetConfig;
}): string {
	const separator = options.datasetConfig.captionAssembly.separator;

	if (
		typeof options.parsedPayload === 'object' &&
		options.parsedPayload !== null &&
		!Array.isArray(options.parsedPayload)
	) {
		const payload = options.parsedPayload as Record<string, unknown>;
		const subjectValues = flattenValue(payload.subject);
		const otherValues = Object.entries(payload)
			.filter(([key]) => key !== 'subject')
			.flatMap(([, value]) => flattenValue(value));
		const orderedValues = options.datasetConfig.captionAssembly.keepSubjectFirst
			? [...subjectValues, ...otherValues]
			: [...otherValues, ...subjectValues];

		return orderedValues.filter(Boolean).join(separator);
	}

	return flattenValue(options.parsedPayload).join(separator);
}

function chooseProviderBaseUrl(options: {
	config: LoraDatasetProviderConfig;
	circuitBreakerState?: ProviderCircuitBreakerState;
}): string {
	if (options.circuitBreakerState?.useFallbackForRestOfBatch && options.config.fallbackBaseUrl) {
		return options.config.fallbackBaseUrl;
	}

	return options.config.baseUrl;
}

function markPrimaryFailure(options: {
	featureConfig: LoraDatasetFeatureConfig;
	circuitBreakerState?: ProviderCircuitBreakerState;
}): void {
	if (!options.circuitBreakerState || !options.featureConfig.provider.fallbackBaseUrl) {
		return;
	}

	options.circuitBreakerState.primaryConsecutiveFailures += 1;
	if (
		options.circuitBreakerState.primaryConsecutiveFailures >=
		options.featureConfig.scheduler.circuitBreakerFailureThreshold
	) {
		options.circuitBreakerState.useFallbackForRestOfBatch = true;
	}
}

function markPrimarySuccess(circuitBreakerState?: ProviderCircuitBreakerState): void {
	if (!circuitBreakerState) {
		return;
	}

	circuitBreakerState.primaryConsecutiveFailures = 0;
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
"""Create one batch-local circuit breaker state for primary/fallback routing.

INTENT: Keep fallback routing deterministic within one batch without introducing global mutable state
INPUT: none
OUTPUT: ProviderCircuitBreakerState
SIDE EFFECT: None
FAILURE: None
"""
 */
export function createProviderCircuitBreakerState(): ProviderCircuitBreakerState {
	return {
		primaryConsecutiveFailures: 0,
		useFallbackForRestOfBatch: false,
	};
}

/**
"""Call the configured vision provider and assemble the final caption text.

INTENT: Unify request building, provider routing, response parsing, and caption assembly across preview and batch
INPUT: imagePath, userPrompt, featureConfig, datasetConfig, apiKey, abortSignal, optional circuitBreakerState
OUTPUT: ProviderCaptionResult
SIDE EFFECT: Issue one network request and resize one image for upload
FAILURE: Throw RetryableProviderError, ProviderFatalError, or ProviderParseError when the request/parse fails
"""
 */
export async function requestCaptionForImage(options: {
	imagePath: string;
	userPrompt: string;
	featureConfig: LoraDatasetFeatureConfig;
	datasetConfig: LoraDatasetDatasetConfig;
	apiKey: string;
	abortSignal: AbortSignal;
	circuitBreakerState?: ProviderCircuitBreakerState;
}): Promise<ProviderCaptionResult> {
	const imageDataUrl = await readImageAsDataUrl({
		imagePath: options.imagePath,
		longEdge: options.featureConfig.analysis.longEdge,
		jpegQuality: options.featureConfig.analysis.jpegQuality,
	});
	const baseUrl = chooseProviderBaseUrl({
		config: options.featureConfig.provider,
		circuitBreakerState: options.circuitBreakerState,
	});
	const payload = buildRequestPayload({
		imageDataUrl,
		userPrompt: options.userPrompt,
		featureConfig: options.featureConfig,
		datasetConfig: options.datasetConfig,
	});

	let rawResponse: unknown;

	try {
		rawResponse = await postChatCompletion({
			baseUrl,
			apiKey: options.apiKey,
			payload,
			timeoutSeconds: options.featureConfig.scheduler.timeoutSeconds,
			abortSignal: options.abortSignal,
		});
		if (baseUrl === options.featureConfig.provider.baseUrl) {
			markPrimarySuccess(options.circuitBreakerState);
		}
	} catch (error) {
		if (
			baseUrl === options.featureConfig.provider.baseUrl &&
			isRetryableProviderError(error)
		) {
			markPrimaryFailure({
				featureConfig: options.featureConfig,
				circuitBreakerState: options.circuitBreakerState,
			});
		}
		throw error;
	}

	const responseText = extractResponseText(rawResponse);
	const parsedPayload = JSON.parse(extractJsonText(responseText)) as unknown;

	return {
		responseText,
		parsedPayload,
		caption: assembleCaption({
			parsedPayload,
			datasetConfig: options.datasetConfig,
		}),
		rawResponse,
	};
}

import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import type { LoraDatasetFeatureConfig } from './schema.js';

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
	config: LoraDatasetFeatureConfig['provider'];
}): Record<string, unknown> {
	return {
		model: options.config.model,
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

function assembleCaption(parsedPayload: unknown): string {
	if (typeof parsedPayload === 'object' && parsedPayload !== null && !Array.isArray(parsedPayload)) {
		const payload = parsedPayload as Record<string, unknown>;
		const subjectValues = flattenValue(payload.subject);
		const otherValues = Object.entries(payload)
			.filter(([key]) => key !== 'subject')
			.flatMap(([, value]) => flattenValue(value));

		return [...subjectValues, ...otherValues].filter(Boolean).join('. ');
	}

	return flattenValue(parsedPayload).join('. ');
}

/**
"""Load the user prompt file and return the full prompt text.

INTENT: 读取用户维护的 prompt 文件，作为 preview 和 batch 的单一提示词来源
INPUT: promptPath
OUTPUT: string
SIDE EFFECT: 读取文件系统
FAILURE: prompt 文件不存在、无法读取或内容为空时抛出 Error
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
	config: LoraDatasetFeatureConfig['provider'],
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
"""Call the OpenAI-compatible vision provider and assemble the final caption text.

INTENT: 统一 preview/full batch 的 provider 请求、响应解析和 caption 组装逻辑
INPUT: imagePath, userPrompt, provider config, apiKey, abortSignal
OUTPUT: ProviderCaptionResult
SIDE EFFECT: 发起网络请求并对图片做分析尺寸压缩
FAILURE: 可重试错误抛出 RetryableProviderError，致命请求错误抛出 ProviderFatalError，响应解析错误抛出 ProviderParseError
"""
 */
export async function requestCaptionForImage(options: {
	imagePath: string;
	userPrompt: string;
	config: LoraDatasetFeatureConfig['provider'];
	apiKey: string;
	abortSignal: AbortSignal;
}): Promise<ProviderCaptionResult> {
	const imageDataUrl = await readImageAsDataUrl({
		imagePath: options.imagePath,
		longEdge: options.config.analysisLongEdge,
		jpegQuality: options.config.analysisJpegQuality,
	});
	const payload = buildRequestPayload({
		imageDataUrl,
		userPrompt: options.userPrompt,
		config: options.config,
	});
	const rawResponse = await postChatCompletion({
		baseUrl: options.config.baseUrl,
		apiKey: options.apiKey,
		payload,
		timeoutSeconds: options.config.timeoutSeconds,
		abortSignal: options.abortSignal,
	});
	const responseText = extractResponseText(rawResponse);
	const parsedPayload = JSON.parse(extractJsonText(responseText)) as unknown;

	return {
		responseText,
		parsedPayload,
		caption: assembleCaption(parsedPayload),
		rawResponse,
	};
}

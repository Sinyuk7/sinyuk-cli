import type { LoraDatasetDatasetConfig } from './schema.js';

const SEPARATOR_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);
const MARKDOWN_FENCE_PATTERN = /```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g;

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFencedBlocks(content: string): string[] {
	const blocks: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = MARKDOWN_FENCE_PATTERN.exec(content)) !== null) {
		const body = match[1]?.trim() ?? '';
		if (body.length > 0) {
			blocks.push(body);
		}
	}

	return blocks;
}

function extractBracketSpanCandidate(input: string): string | undefined {
	const firstBrace = input.indexOf('{');
	const lastBrace = input.lastIndexOf('}');
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		return input.slice(firstBrace, lastBrace + 1).trim();
	}

	const firstBracket = input.indexOf('[');
	const lastBracket = input.lastIndexOf(']');
	if (firstBracket !== -1 && lastBracket > firstBracket) {
		return input.slice(firstBracket, lastBracket + 1).trim();
	}

	return undefined;
}

function extractBalancedJsonCandidate(input: string): string | undefined {
	const length = input.length;

	for (let start = 0; start < length; start += 1) {
		const startChar = input[start];
		if (startChar !== '{' && startChar !== '[') {
			continue;
		}

		const stack: string[] = [startChar];
		let inString = false;
		let isEscaped = false;

		for (let index = start + 1; index < length; index += 1) {
			const char = input[index];
			if (inString) {
				if (isEscaped) {
					isEscaped = false;
					continue;
				}
				if (char === '\\') {
					isEscaped = true;
					continue;
				}
				if (char === '"') {
					inString = false;
				}
				continue;
			}

			if (char === '"') {
				inString = true;
				continue;
			}
			if (char === '{' || char === '[') {
				stack.push(char);
				continue;
			}
			if (char !== '}' && char !== ']') {
				continue;
			}

			const open = stack[stack.length - 1];
			const expectedClose = open === '{' ? '}' : ']';
			if (char !== expectedClose) {
				break;
			}

			stack.pop();
			if (stack.length === 0) {
				return input.slice(start, index + 1).trim();
			}
		}
	}

	return undefined;
}

function collectJsonCandidates(content: string): string[] {
	const candidates: string[] = [];
	const trimmed = content.trim();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		candidates.push(trimmed);
	}

	const fencedBlocks = extractFencedBlocks(content);
	candidates.push(...fencedBlocks);

	const bracketSpan = extractBracketSpanCandidate(trimmed);
	if (bracketSpan) {
		candidates.push(bracketSpan);
	}

	const balancedCandidate = extractBalancedJsonCandidate(trimmed);
	if (balancedCandidate) {
		candidates.push(balancedCandidate);
	}

	return [...new Set(candidates.filter((candidate) => candidate.length > 0))];
}

function parseStructuredJson(content: string): unknown | undefined {
	for (const candidate of collectJsonCandidates(content)) {
		try {
			return JSON.parse(candidate) as unknown;
		} catch {
			// Keep trying alternative candidates.
		}
	}

	return undefined;
}

function normalizeLooseValue(rawValue: string): string {
	let value = rawValue.trim().replace(/,$/, '');
	if (value.length === 0 || value === 'null') {
		return '';
	}

	if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
		try {
			const parsed = JSON.parse(value) as unknown;
			return collapseWhitespace(String(parsed));
		} catch {
			value = value.slice(1, -1);
		}
	} else if (value.startsWith('"')) {
		value = value.slice(1);
	} else if (value.endsWith('"')) {
		value = value.slice(0, -1);
	}

	return collapseWhitespace(value.replace(/\\"/g, '"'));
}

function parseLooseJsonObject(content: string): Record<string, string> | undefined {
	const source = extractFencedBlocks(content).join('\n') || content;
	const payload: Record<string, string> = {};
	const pairPattern = /"([^"\\]+)"\s*:\s*("(?:\\.|[^"\\])*"?|[^,\n{}]+)/g;
	let match: RegExpExecArray | null;

	while ((match = pairPattern.exec(source)) !== null) {
		const key = match[1]?.trim() ?? '';
		const value = normalizeLooseValue(match[2] ?? '');
		if (key.length > 0 && value.length > 0) {
			payload[key] = value;
		}
	}

	return Object.keys(payload).length > 0 ? payload : undefined;
}

function flattenValue(input: unknown): string[] {
	if (input === null || input === undefined) {
		return [];
	}

	if (Array.isArray(input)) {
		return input.flatMap((item) => flattenValue(item));
	}

	if (typeof input === 'object') {
		return Object.values(input as Record<string, unknown>).flatMap((item) => flattenValue(item));
	}

	const value = collapseWhitespace(String(input));
	return value.length > 0 ? [value] : [];
}

function normalizeCaptionSegment(segment: string, separator: string): string {
	let compact = collapseWhitespace(segment);
	const separatorToken = separator.trim();
	if (separatorToken.length > 0 && /^[\W_]+$/.test(separatorToken)) {
		compact = compact
			.replace(new RegExp(`(?:${escapeRegExp(separatorToken)})+$`), '')
			.trim();
	}

	const firstSeparatorChar = separatorToken[0];
	if (!firstSeparatorChar || !SEPARATOR_PUNCTUATION.has(firstSeparatorChar)) {
		return compact;
	}

	return compact.replace(new RegExp(`${escapeRegExp(firstSeparatorChar)}+$`), '').trim();
}

function assembleCaptionFromPayload(options: {
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
		const orderedValues = options.datasetConfig.captionAssembly.outputFields.flatMap((field) =>
			flattenValue(payload[field]),
		);

		return orderedValues
			.map((value) => normalizeCaptionSegment(value, separator))
			.filter((value) => value.length > 0)
			.join(separator);
	}

	return flattenValue(options.parsedPayload)
		.map((value) => normalizeCaptionSegment(value, separator))
		.filter((value) => value.length > 0)
		.join(separator);
}

function sanitizePlainTextFallback(content: string): string {
	const fencedBlocks = extractFencedBlocks(content);
	const source = fencedBlocks.length > 0 ? fencedBlocks.join('\n') : content;
	const stripped = source.replace(/```(?:[a-zA-Z0-9_-]+)?/g, '').replace(/```/g, '');
	const compact = collapseWhitespace(stripped);
	return compact.length > 0 ? compact : content.trim();
}

/**
"""Convert assistant content into final caption text with robust JSON compatibility.

INTENT: Centralize response content cleaning, JSON extraction, tolerant parsing, and caption formatting in one place
INPUT: responseText, datasetConfig
OUTPUT: { caption, parsedPayload? }
SIDE EFFECT: None
FAILURE: None
"""
 */
export function buildCaptionFromResponseText(options: {
	responseText: string;
	datasetConfig: LoraDatasetDatasetConfig;
}): {
	caption: string;
	parsedPayload?: unknown;
} {
	const normalizedText = options.responseText.replace(/^\uFEFF/, '').trim();
	const parsedPayload = parseStructuredJson(normalizedText) ?? parseLooseJsonObject(normalizedText);

	if (parsedPayload !== undefined) {
		const caption = assembleCaptionFromPayload({
			parsedPayload,
			datasetConfig: options.datasetConfig,
		});
		if (caption.length > 0) {
			return {
				parsedPayload,
				caption,
			};
		}
	}

	return {
		caption: sanitizePlainTextFallback(normalizedText),
	};
}

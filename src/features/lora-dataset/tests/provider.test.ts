import { describe, expect, test } from 'vitest';

import {
	buildCaptionFromResponseText,
	buildRequestPayload,
	extractAssistantContentText,
} from '../shared/provider.js';
import { readLoraDatasetTemplate } from '../shared/templates.js';
import { DATASET_CONFIG, FEATURE_CONFIG, TEST_PROMPT } from './_test-helpers.js';

describe('provider request contract', () => {
	test('builds the expected OpenAI-compatible request payload', () => {
		const payload = buildRequestPayload({
			imageDataUrl: 'data:image/jpeg;base64,abc123',
			systemPrompt: readLoraDatasetTemplate('systemPrompt').trim(),
			userPrompt: TEST_PROMPT,
			featureConfig: FEATURE_CONFIG,
			datasetConfig: DATASET_CONFIG,
		});

		expect(payload.model).toBe(FEATURE_CONFIG.provider.model);
		expect(payload.temperature).toBe(DATASET_CONFIG.request.temperature);
		expect(payload.top_p).toBe(DATASET_CONFIG.request.topP);
		expect(payload.max_tokens).toBe(DATASET_CONFIG.request.maxOutputTokens);
		expect(payload.messages).toHaveLength(2);
		expect(payload.messages[0]).toEqual({
			role: 'system',
			content: readLoraDatasetTemplate('systemPrompt').trim(),
		});
		expect(payload.messages[1]?.role).toBe('user');
		expect(payload.messages[1]?.content).toEqual([
			{
				type: 'image_url',
				image_url: {
					url: 'data:image/jpeg;base64,abc123',
				},
			},
			{
				type: 'text',
				text: TEST_PROMPT,
			},
		]);
	});
});

describe('provider response parsing', () => {
	test('extracts assistant content without reasoning traces', () => {
		const responseText = extractAssistantContentText({
			choices: [
				{
					message: {
						role: 'assistant',
						content: '{"subject":"silver-haired woman","details":"maid outfit"}',
						reasoning_content: 'hidden reasoning',
					},
				},
			],
		});

		expect(responseText).toBe('{"subject":"silver-haired woman","details":"maid outfit"}');
	});

	test('assembles captions from JSON content', () => {
		const result = buildCaptionFromResponseText({
			responseText: '{"subject":"silver-haired woman","details":"maid outfit"}',
			datasetConfig: DATASET_CONFIG,
		});

		expect(result.parsedPayload).toEqual({
			subject: 'silver-haired woman',
			details: 'maid outfit',
		});
		expect(result.caption).toBe('silver-haired woman. maid outfit');
	});

	test('parses JSON from markdown fenced content', () => {
		const result = buildCaptionFromResponseText({
			responseText:
				'```json\n{"subject":"Young Asian woman","action":"The subject is standing dynamically"}\n```',
			datasetConfig: DATASET_CONFIG,
		});

		expect(result.parsedPayload).toEqual({
			subject: 'Young Asian woman',
			action: 'The subject is standing dynamically',
		});
		expect(result.caption).toBe('Young Asian woman. The subject is standing dynamically');
	});

	test('deduplicates trailing punctuation that conflicts with separator', () => {
		const result = buildCaptionFromResponseText({
			responseText:
				'{"subject":"Young asian woman.","action":"The subject is posing with her right hand raised gently near her chin and holding a large staff with her left hand..","clothing":"The subject is wearing a white outfit."}',
			datasetConfig: DATASET_CONFIG,
		});

		expect(result.caption).toBe(
			'Young asian woman. The subject is posing with her right hand raised gently near her chin and holding a large staff with her left hand. The subject is wearing a white outfit',
		);
		expect(result.caption.includes('..')).toBe(false);
	});

	test('deduplicates repeated commas when separator is comma-space', () => {
		const result = buildCaptionFromResponseText({
			responseText:
				'{"subject":"Young asian woman,","action":"The subject is posing dynamically,,","style":"Studio portrait,"}',
			datasetConfig: {
				...DATASET_CONFIG,
				captionAssembly: {
					...DATASET_CONFIG.captionAssembly,
					separator: ', ',
				},
			},
		});

		expect(result.caption).toBe(
			'Young asian woman, The subject is posing dynamically, Studio portrait',
		);
		expect(result.caption.includes(',,')).toBe(false);
	});

	test('deduplicates repeated symbol separators when separator is pipe', () => {
		const result = buildCaptionFromResponseText({
			responseText:
				'{"subject":"Young asian woman |","action":"The subject is posing dynamically |||","style":"Studio portrait|"}',
			datasetConfig: {
				...DATASET_CONFIG,
				captionAssembly: {
					...DATASET_CONFIG.captionAssembly,
					separator: ' | ',
				},
			},
		});

		expect(result.caption).toBe(
			'Young asian woman | The subject is posing dynamically | Studio portrait',
		);
		expect(result.caption.includes('||')).toBe(false);
	});

	test('extracts loose key-value pairs from truncated markdown JSON block', () => {
		const result = buildCaptionFromResponseText({
			responseText: `\`\`\`json
{
  "subject": "Young Asian woman",
  "action": "The subject is standing dynamically with one hand on hip",
  "clothing": "The subject is wearing a whit
\`\`\``,
			datasetConfig: DATASET_CONFIG,
		});

		expect(result.parsedPayload).toEqual({
			subject: 'Young Asian woman',
			action: 'The subject is standing dynamically with one hand on hip',
			clothing: 'The subject is wearing a whit',
		});
		expect(result.caption).toBe(
			'Young Asian woman. The subject is standing dynamically with one hand on hip. The subject is wearing a whit',
		);
	});

	test('falls back to plain assistant content when response is not JSON', () => {
		const result = buildCaptionFromResponseText({
			responseText: 'silver-haired woman, maid outfit, ornate chair',
			datasetConfig: DATASET_CONFIG,
		});

		expect(result.parsedPayload).toBeUndefined();
		expect(result.caption).toBe('silver-haired woman, maid outfit, ornate chair');
	});

	test('extracts partial fields from malformed JSON-looking content', () => {
		const result = buildCaptionFromResponseText({
			responseText: '{"subject":"silver-haired woman"',
			datasetConfig: DATASET_CONFIG,
		});

		expect(result.parsedPayload).toEqual({
			subject: 'silver-haired woman',
		});
		expect(result.caption).toBe('silver-haired woman');
	});
});

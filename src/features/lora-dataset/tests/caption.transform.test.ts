import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import type { LoraScanResult } from '../shared/artifacts.js';
import {
	applyCaptionTriggerTransform,
	runCaptionTransform,
} from '../caption/transform.js';
import { createTempDir } from './_test-helpers.js';

function createScanResult(basePath: string): LoraScanResult {
	const image1Path = join(basePath, 'image_0001.png');
	const image2Path = join(basePath, 'image_0002.png');
	return {
		basePath,
		images: [
			{
				absolutePath: image1Path,
				relativePath: 'image_0001.png',
				captionPath: image1Path.replace('.png', '.txt'),
				rawResponsePath: join(basePath, '_lora_dataset', 'raw', '1.json'),
			},
			{
				absolutePath: image2Path,
				relativePath: 'image_0002.png',
				captionPath: image2Path.replace('.png', '.txt'),
				rawResponsePath: join(basePath, '_lora_dataset', 'raw', '2.json'),
			},
		],
		extensionCounts: { '.png': 2 },
	};
}

describe('applyCaptionTriggerTransform', () => {
	test('prefix mode prepends trigger once', () => {
		const result = applyCaptionTriggerTransform({
			caption: 'A portrait photo',
			trigger: 'body_lora',
			mode: 'prefix',
			separator: ', ',
			placeholder: '[trigger]',
			onMissingPlaceholder: 'fail',
		});

		expect(result.caption).toBe('body_lora, A portrait photo');
		expect(result.changed).toBe(true);
	});

	test('prefix mode stays unchanged when already prefixed', () => {
		const result = applyCaptionTriggerTransform({
			caption: 'body_lora, A portrait photo',
			trigger: 'body_lora',
			mode: 'prefix',
			separator: ', ',
			placeholder: '[trigger]',
			onMissingPlaceholder: 'fail',
		});

		expect(result.caption).toBe('body_lora, A portrait photo');
		expect(result.changed).toBe(false);
	});

	test('suffix mode appends trigger', () => {
		const result = applyCaptionTriggerTransform({
			caption: 'A portrait photo',
			trigger: 'body_lora',
			mode: 'suffix',
			separator: ', ',
			placeholder: '[trigger]',
			onMissingPlaceholder: 'fail',
		});

		expect(result.caption).toBe('A portrait photo, body_lora');
		expect(result.changed).toBe(true);
	});

	test('replace-placeholder mode replaces placeholder token', () => {
		const result = applyCaptionTriggerTransform({
			caption: '[trigger], A portrait photo',
			trigger: 'body_lora',
			mode: 'replace-placeholder',
			separator: ', ',
			placeholder: '[trigger]',
			onMissingPlaceholder: 'fail',
		});

		expect(result.caption).toBe('body_lora, A portrait photo');
		expect(result.changed).toBe(true);
	});

	test('replace-placeholder mode fails when placeholder is missing and policy is fail', () => {
		expect(() =>
			applyCaptionTriggerTransform({
				caption: 'A portrait photo',
				trigger: 'body_lora',
				mode: 'replace-placeholder',
				separator: ', ',
				placeholder: '[trigger]',
				onMissingPlaceholder: 'fail',
			}),
		).toThrow('Placeholder "[trigger]" not found.');
	});
});

describe('runCaptionTransform', () => {
	test('updates existing captions and reports missing caption files', async () => {
		const datasetPath = createTempDir('caption-transform-');
		const scanResult = createScanResult(datasetPath);
		mkdirSync(datasetPath, { recursive: true });
		writeFileSync(scanResult.images[0]!.captionPath, 'A portrait photo\n', 'utf8');

		const result = await runCaptionTransform({
			scanResult,
			trigger: 'body_lora',
			mode: 'prefix',
			separator: ', ',
			placeholder: '[trigger]',
			onMissingPlaceholder: 'fail',
			dryRun: false,
		});

		expect(result.totalImages).toBe(2);
		expect(result.captionsFound).toBe(1);
		expect(result.updated).toBe(1);
		expect(result.unchanged).toBe(0);
		expect(result.missingCaption).toBe(1);
		expect(result.failed).toEqual([]);
		expect(await readFile(scanResult.images[0]!.captionPath, 'utf8')).toBe(
			'body_lora, A portrait photo\n',
		);
	});

	test('collects per-file failures when placeholder is missing in strict mode', async () => {
		const datasetPath = createTempDir('caption-transform-');
		const scanResult = createScanResult(datasetPath);
		mkdirSync(datasetPath, { recursive: true });
		writeFileSync(scanResult.images[0]!.captionPath, 'A portrait photo\n', 'utf8');

		const result = await runCaptionTransform({
			scanResult: {
				...scanResult,
				images: [scanResult.images[0]!],
			},
			trigger: 'body_lora',
			mode: 'replace-placeholder',
			separator: ', ',
			placeholder: '[trigger]',
			onMissingPlaceholder: 'fail',
			dryRun: false,
		});

		expect(result.updated).toBe(0);
		expect(result.failed).toEqual([
			{
				key: 'image_0001.png',
				reason: 'Placeholder "[trigger]" not found.',
			},
		]);
		expect(await readFile(scanResult.images[0]!.captionPath, 'utf8')).toBe('A portrait photo\n');
	});
});

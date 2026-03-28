/**
 * Tests for image discovery (scan/artifacts) in lora-dataset.
 *
 * INTENT: Verify discoverLoraImages finds images correctly, respects exclusion rules, and generates proper paths
 * INPUT: .local-data test images (test-1: 1 image, test-2: 5 images)
 * OUTPUT: Validated scan results
 * SIDE EFFECT: Temp filesystem writes
 * FAILURE: Fail fast on unexpected scan results
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { discoverLoraImages } from '../shared/artifacts.js';
import { resolveLoraDatasetWorkspace } from '../shared/workspace.js';
import {
	TEST_1_DIR,
	TEST_2_DIR,
	setupDatasetWorkspace,
	withTempSinyukHome,
} from './_test-helpers.js';

// ---------------------------------------------------------------------------
// test-1-image-1: single image discovery
// ---------------------------------------------------------------------------

describe('scan — single image (test-1)', () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test('discovers exactly 1 PNG image', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const result = await discoverLoraImages(datasetPath);

		expect(result.images).toHaveLength(1);
		expect(result.images[0]!.relativePath).toBe('034.PNG');
		expect(result.extensionCounts['.png']).toBe(1);
		expect(result.basePath).toBe(resolve(datasetPath));
	});

	test('generates captionPath (.txt) and rawResponsePath (.json)', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const result = await discoverLoraImages(datasetPath);
		const image = result.images[0]!;

		expect(image.captionPath).toMatch(/034\.txt$/);
		expect(image.rawResponsePath).toContain('raw');
		expect(image.rawResponsePath).toMatch(/\.json$/);
	});

	test('excludes _lora_dataset workspace directory', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		writeFileSync(join(workspace.workDirPath, 'noise.png'), Buffer.alloc(10));

		const result = await discoverLoraImages(datasetPath);
		expect(result.images).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// test-2-image-5: multi-image discovery + ordering
// ---------------------------------------------------------------------------

describe('scan — multi image (test-2)', () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test('discovers all 5 PNG images', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_2_DIR, env.getHomePath());
		const result = await discoverLoraImages(datasetPath);

		expect(result.images).toHaveLength(5);
		expect(result.extensionCounts['.png']).toBe(5);
	});

	test('images are sorted by relativePath', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_2_DIR, env.getHomePath());
		const result = await discoverLoraImages(datasetPath);

		const names = result.images.map((img) => img.relativePath);
		const sorted = [...names].sort((a, b) => a.localeCompare(b));
		expect(names).toEqual(sorted);
	});

	test('excludes dataset-crop output directories', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_2_DIR, env.getHomePath());
		const cropDir = join(resolve(datasetPath), 'dataset-crop-1x1-512');
		mkdirSync(cropDir, { recursive: true });
		writeFileSync(join(cropDir, 'image_0001.png'), Buffer.alloc(10));

		const result = await discoverLoraImages(datasetPath);
		expect(result.images).toHaveLength(5);
	});
});

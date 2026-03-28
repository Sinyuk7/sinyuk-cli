/**
 * Tests for the crop action (sharp-based image cropping).
 *
 * INTENT: Verify runCrop produces correct output files, handles skip/rerun, copies captions, and respects abort
 * INPUT: .local-data test images (test-1: single, test-2: batch)
 * OUTPUT: Cropped JPGs in output directory, caption .txt copies
 * SIDE EFFECT: Temp filesystem writes via sharp
 * FAILURE: Fail fast on crop errors or unexpected file state
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { discoverLoraImages } from '../shared/artifacts.js';
import { runCrop } from '../shared/pipeline.js';
import {
	TEST_1_DIR,
	TEST_2_DIR,
	setupDatasetWorkspace,
	withTempSinyukHome,
} from './_test-helpers.js';

// ---------------------------------------------------------------------------
// test-1-image-1: single image crop scenarios
// ---------------------------------------------------------------------------

describe('crop — single image (test-1)', { timeout: 60_000 }, () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test('crops 1 image to 1:1@512 and creates output jpg', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const scanResult = await discoverLoraImages(datasetPath);

		const progressFiles: string[] = [];
		const result = await runCrop({
			scanResult,
			profile: { ratio: '1:1', longEdge: 512 },
			abortSignal: AbortSignal.timeout(30_000),
			onProgress: (p) => progressFiles.push(p.file),
		});

		expect(result.total).toBe(1);
		expect(result.cropped).toBe(1);
		expect(result.skippedExisting).toBe(0);
		expect(result.failed).toHaveLength(0);
		expect(result.outputDir).toContain('dataset-crop-1x1-512');
		expect(existsSync(join(result.outputDir, 'image_0001.jpg'))).toBe(true);
		expect(progressFiles).toHaveLength(1);
	});

	test('skips already-cropped image on rerun', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const scanResult = await discoverLoraImages(datasetPath);
		const profile = { ratio: '1:1', longEdge: 512 };

		await runCrop({ scanResult, profile, abortSignal: AbortSignal.timeout(30_000) });
		const result2 = await runCrop({ scanResult, profile, abortSignal: AbortSignal.timeout(30_000) });

		expect(result2.cropped).toBe(0);
		expect(result2.skippedExisting).toBe(1);
	});

	test('copies caption .txt alongside cropped image', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const scanResult = await discoverLoraImages(datasetPath);
		writeFileSync(scanResult.images[0]!.captionPath, 'A test caption.\n', 'utf8');

		const result = await runCrop({
			scanResult,
			profile: { ratio: '1:1', longEdge: 512 },
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(result.copiedTxt).toBe(1);
		expect(result.missingTxt).toBe(0);
		const outputTxt = join(result.outputDir, 'image_0001.txt');
		expect(existsSync(outputTxt)).toBe(true);
		expect(readFileSync(outputTxt, 'utf8')).toContain('A test caption.');
	});

	test('reports missingTxt=1 when no source caption exists', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const scanResult = await discoverLoraImages(datasetPath);

		const result = await runCrop({
			scanResult,
			profile: { ratio: '1:1', longEdge: 512 },
			abortSignal: AbortSignal.timeout(30_000),
		});

		expect(result.copiedTxt).toBe(0);
		expect(result.missingTxt).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// test-2-image-5: batch crop with different profile
// ---------------------------------------------------------------------------

describe('crop — multi image batch (test-2)', { timeout: 60_000 }, () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test('crops all 5 images to 3:4@768', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_2_DIR, env.getHomePath());
		const scanResult = await discoverLoraImages(datasetPath);

		const result = await runCrop({
			scanResult,
			profile: { ratio: '3:4', longEdge: 768 },
			abortSignal: AbortSignal.timeout(60_000),
		});

		expect(result.total).toBe(5);
		expect(result.cropped).toBe(5);
		expect(result.failed).toHaveLength(0);
		expect(result.outputDir).toContain('dataset-crop-3x4-768');

		for (let i = 1; i <= 5; i++) {
			expect(existsSync(join(result.outputDir, `image_${String(i).padStart(4, '0')}.jpg`))).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// Abort signal
// ---------------------------------------------------------------------------

describe('crop — abort signal', { timeout: 30_000 }, () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test('throws when abort signal is already triggered', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_2_DIR, env.getHomePath());
		const scanResult = await discoverLoraImages(datasetPath);
		const controller = new AbortController();
		controller.abort();

		await expect(
			runCrop({ scanResult, profile: { ratio: '1:1', longEdge: 512 }, abortSignal: controller.signal }),
		).rejects.toThrow('cancelled');
	});
});

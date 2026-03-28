/**
 * End-to-end tests for the caption action (requires real VLM API).
 *
 * INTENT: Verify requestCaptionForImage, runPreview, and runBatch against a real provider
 * INPUT: .local-data test images, API key from env var TEST_LORA_API_KEY
 * OUTPUT: Validated captions, artifacts, and skip-on-rerun behavior
 * SIDE EFFECT: Network calls to VLM provider, temp filesystem writes
 * FAILURE: Skip all tests when TEST_LORA_API_KEY is not set
 *
 * Run with: TEST_LORA_API_KEY=sk-xxx npx vitest run src/features/lora-dataset/tests/caption.e2e.test.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { discoverLoraImages } from '../shared/artifacts.js';
import { loadScanContext, runBatch, runPreview } from '../shared/pipeline.js';
import { requestCaptionForImage } from '../shared/provider.js';
import { resolveLoraDatasetWorkspace } from '../shared/workspace.js';
import {
	API_KEY,
	DATASET_CONFIG,
	FEATURE_CONFIG,
	HAS_API_KEY,
	TEST_1_DIR,
	TEST_2_DIR,
	TEST_PROMPT,
	createTestExecutionContext,
	setupDatasetWorkspace,
	withTempSinyukHome,
} from './_test-helpers.js';

// ---------------------------------------------------------------------------
// requestCaptionForImage — single image (test-1)
// ---------------------------------------------------------------------------

describe('caption: requestCaptionForImage', { timeout: 120_000 }, () => {
	test.skipIf(!HAS_API_KEY)('returns structured caption for 034.PNG', async () => {
		const imagePath = join(TEST_1_DIR, '034.PNG');
		const result = await requestCaptionForImage({
			imagePath,
			userPrompt: TEST_PROMPT,
			featureConfig: FEATURE_CONFIG,
			datasetConfig: DATASET_CONFIG,
			apiKey: API_KEY,
			abortSignal: AbortSignal.timeout(120_000),
		});

		expect(result.responseText).toBeTruthy();
		expect(typeof result.caption).toBe('string');
		expect(result.caption.length).toBeGreaterThan(5);
		expect(result.rawResponse).toBeTruthy();
		expect(result.parsedPayload).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// loadScanContext — multi-image (test-2)
// ---------------------------------------------------------------------------

describe('caption: loadScanContext', () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test('returns workspace, 5 images, and prompt preview lines', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_2_DIR, env.getHomePath());
		const context = await loadScanContext({ pathInput: datasetPath });

		expect(context.workspace.datasetPath).toBe(resolve(datasetPath));
		expect(context.scanResult.images).toHaveLength(5);
		expect(context.datasetConfig).toEqual(DATASET_CONFIG);
		expect(context.promptPreviewLines.length).toBeGreaterThan(0);
		expect(context.promptPreviewLines[0]).toContain('Return strict JSON');
	});
});

// ---------------------------------------------------------------------------
// runPreview — single image (test-1)
// ---------------------------------------------------------------------------

describe('caption: runPreview', { timeout: 120_000 }, () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test.skipIf(!HAS_API_KEY)('returns preview caption targeting the only image', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		const scanResult = await discoverLoraImages(datasetPath);
		const ctx = createTestExecutionContext();

		const preview = await runPreview({
			scanResult,
			config: FEATURE_CONFIG,
			datasetConfig: DATASET_CONFIG,
			workspace,
			executionContext: ctx,
			previewFile: scanResult.images[0]!.relativePath,
		});

		expect(preview.relativePath).toBe('034.PNG');
		expect(preview.caption.length).toBeGreaterThan(5);
		expect(preview.responseText).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// runBatch — single image (test-1): artifacts + rerun skip
// ---------------------------------------------------------------------------

describe('caption: runBatch — single image', { timeout: 300_000 }, () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test.skipIf(!HAS_API_KEY)('captions 1 image and writes all artifacts', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		const scanResult = await discoverLoraImages(datasetPath);
		const ctx = createTestExecutionContext();

		const progressEvents: number[] = [];
		const result = await runBatch({
			scanResult,
			config: FEATURE_CONFIG,
			datasetConfig: DATASET_CONFIG,
			workspace,
			executionContext: ctx,
			concurrencyOverride: 1,
			onProgress: (p) => progressEvents.push(p.completed),
		});

		expect(result.total).toBe(1);
		expect(result.failed).toHaveLength(0);
		expect(result.statusCounts['captioned']).toBe(1);

		// caption .txt artifact
		const image = scanResult.images[0]!;
		expect(existsSync(image.captionPath)).toBe(true);
		expect(readFileSync(image.captionPath, 'utf8').trim().length).toBeGreaterThan(5);

		// raw response .json artifact
		expect(existsSync(image.rawResponsePath)).toBe(true);
		expect(JSON.parse(readFileSync(image.rawResponsePath, 'utf8'))).toBeTruthy();

		// run-summary.json
		expect(existsSync(workspace.runSummaryPath)).toBe(true);
		const summary = JSON.parse(readFileSync(workspace.runSummaryPath, 'utf8'));
		expect(summary.phase).toBe('batch');
		expect(summary.total).toBe(1);

		// progress callback fired
		expect(progressEvents.length).toBeGreaterThan(0);
	});

	test.skipIf(!HAS_API_KEY)('skips already-captioned images on rerun', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		const scanResult = await discoverLoraImages(datasetPath);
		const ctx = createTestExecutionContext();

		await runBatch({
			scanResult,
			config: FEATURE_CONFIG,
			datasetConfig: DATASET_CONFIG,
			workspace,
			executionContext: ctx,
			concurrencyOverride: 1,
		});

		const result2 = await runBatch({
			scanResult,
			config: FEATURE_CONFIG,
			datasetConfig: DATASET_CONFIG,
			workspace,
			executionContext: ctx,
			concurrencyOverride: 1,
		});
		expect(result2.total).toBe(1);
		expect(result2.statusCounts['skipped']).toBe(1);
		expect(result2.statusCounts['captioned']).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// runBatch — multi-image with concurrency (test-2)
// ---------------------------------------------------------------------------

describe('caption: runBatch — multi image concurrency', { timeout: 300_000 }, () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test.skipIf(!HAS_API_KEY)('captions all 5 images with concurrency=2', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_2_DIR, env.getHomePath());
		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		const scanResult = await discoverLoraImages(datasetPath);
		const ctx = createTestExecutionContext();

		const result = await runBatch({
			scanResult,
			config: FEATURE_CONFIG,
			datasetConfig: DATASET_CONFIG,
			workspace,
			executionContext: ctx,
			concurrencyOverride: 2,
		});

		expect(result.total).toBe(5);
		expect(result.failed).toHaveLength(0);
		expect((result.statusCounts['captioned'] ?? 0) + (result.statusCounts['skipped'] ?? 0)).toBe(5);

		for (const image of scanResult.images) {
			expect(existsSync(image.captionPath)).toBe(true);
			expect(readFileSync(image.captionPath, 'utf8').trim().length).toBeGreaterThan(0);
		}
	});
});

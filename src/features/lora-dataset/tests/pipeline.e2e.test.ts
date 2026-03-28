/**
 * Full pipeline integration test: caption → crop (requires real VLM API).
 *
 * INTENT: Verify the complete workflow — caption images then crop with captions carried over
 * INPUT: .local-data/test-1-image-1, API key from env var TEST_LORA_API_KEY
 * OUTPUT: Cropped image + caption txt in output directory
 * SIDE EFFECT: Network calls to VLM provider, temp filesystem writes via sharp
 * FAILURE: Skip when TEST_LORA_API_KEY is not set
 *
 * Run with: TEST_LORA_API_KEY=sk-xxx npx vitest run src/features/lora-dataset/tests/pipeline.e2e.test.ts
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { discoverLoraImages } from '../shared/artifacts.js';
import { runBatch, runCrop } from '../shared/pipeline.js';
import { resolveLoraDatasetWorkspace } from '../shared/workspace.js';
import {
	FEATURE_CONFIG,
	HAS_API_KEY,
	TEST_1_DIR,
	createTestExecutionContext,
	setupDatasetWorkspace,
	withTempSinyukHome,
} from './_test-helpers.js';

describe('pipeline: caption → crop integration', { timeout: 300_000 }, () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test.skipIf(!HAS_API_KEY)('captions then crops with caption carried over', async () => {
		const { datasetPath } = setupDatasetWorkspace(TEST_1_DIR, env.getHomePath());
		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		const scanResult = await discoverLoraImages(datasetPath);
		const ctx = createTestExecutionContext();

		// Step 1: Caption
		const batchResult = await runBatch({
			scanResult,
			config: FEATURE_CONFIG,
			workspace,
			executionContext: ctx,
			concurrencyOverride: 1,
		});
		expect(batchResult.failed).toHaveLength(0);
		expect(batchResult.statusCounts['captioned']).toBe(1);

		// Step 2: Crop
		const cropResult = await runCrop({
			scanResult,
			profile: FEATURE_CONFIG.cropProfiles[0]!,
			abortSignal: AbortSignal.timeout(30_000),
		});
		expect(cropResult.cropped).toBe(1);
		expect(cropResult.copiedTxt).toBe(1);
		expect(cropResult.missingTxt).toBe(0);

		// Verify both output files exist
		expect(existsSync(join(cropResult.outputDir, 'image_0001.jpg'))).toBe(true);
		expect(existsSync(join(cropResult.outputDir, 'image_0001.txt'))).toBe(true);

		// Verify caption content is non-trivial
		const captionContent = readFileSync(join(cropResult.outputDir, 'image_0001.txt'), 'utf8').trim();
		expect(captionContent.length).toBeGreaterThan(5);
	});
});

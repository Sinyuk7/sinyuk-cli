import { describe, expect, test, vi, beforeEach } from 'vitest';

import type { LoraScanResult } from '../shared/artifacts.js';
import type { LoraDatasetDatasetConfig } from '../shared/schema.js';
import type { LoraDatasetWorkspace } from '../shared/workspace.js';
import { createTestExecutionContext, PLATFORM_CONFIG } from './_test-helpers.js';

const { mockLoadScanContext, mockRunBatch, mockRunPreview } = vi.hoisted(() => ({
	mockLoadScanContext: vi.fn(),
	mockRunBatch: vi.fn(),
	mockRunPreview: vi.fn(),
}));

vi.mock('../shared/pipeline.js', async () => {
	const actual =
		await vi.importActual<typeof import('../shared/pipeline.js')>('../shared/pipeline.js');

	return {
		...actual,
		loadScanContext: mockLoadScanContext,
		runBatch: mockRunBatch,
		runPreview: mockRunPreview,
	};
});

import { createCaptionStore } from '../caption/store.js';

const EMPTY_SCAN_RESULT: LoraScanResult = {
	basePath: '/tmp/empty-dataset',
	images: [],
	extensionCounts: {},
};

const DATASET_CONFIG: LoraDatasetDatasetConfig = {
	request: {
		temperature: 0.2,
		topP: 0.9,
		maxOutputTokens: 256,
	},
	captionAssembly: {
		separator: '. ',
		keepSubjectFirst: true,
	},
};

const WORKSPACE: LoraDatasetWorkspace = {
	datasetPath: '/tmp/empty-dataset',
	workDirPath: '/tmp/empty-dataset/_lora_dataset',
	promptTemplatePath: '/tmp/home/features/lora-dataset/prompts/user-prompt.txt.example',
	configPath: '/tmp/empty-dataset/_lora_dataset/config.yaml',
	promptPath: '/tmp/empty-dataset/_lora_dataset/user-prompt.txt',
	runSummaryPath: '/tmp/empty-dataset/_lora_dataset/run-summary.json',
	failedItemsPath: '/tmp/empty-dataset/_lora_dataset/failed-items.txt',
	rawDirPath: '/tmp/empty-dataset/_lora_dataset/raw',
};

/**
"""Create a caption store bound to the shared feature test config.

INTENT: Keep caption store tests focused on state transitions rather than config setup
INPUT: none
OUTPUT: caption store instance
SIDE EFFECT: None
FAILURE: None
"""
 */
function createTestStore() {
	return createCaptionStore({
		configSnapshot: PLATFORM_CONFIG,
		abortSignal: AbortSignal.timeout(5_000),
		entryMode: 'cli',
		createExecutionContext: () => createTestExecutionContext(),
	});
}

describe('caption store', () => {
	beforeEach(() => {
		mockLoadScanContext.mockReset();
		mockRunBatch.mockReset();
		mockRunPreview.mockReset();
	});

	test('transitions to empty when scan finds no supported images', async () => {
		mockLoadScanContext.mockResolvedValue({
			workspace: WORKSPACE,
			scanResult: EMPTY_SCAN_RESULT,
			datasetConfig: DATASET_CONFIG,
			promptPreviewLines: ['Prompt preview'],
		});

		const store = createTestStore();
		await store.getState().actions.startScan('/tmp/empty-dataset');

		expect(store.getState().step).toBe('empty');
		expect(store.getState().scanResult).toEqual(EMPTY_SCAN_RESULT);
		expect(store.getState().errorMessage).toBeNull();
	});
});

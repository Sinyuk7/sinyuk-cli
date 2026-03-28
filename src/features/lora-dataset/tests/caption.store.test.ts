import { describe, expect, test, vi, beforeEach } from 'vitest';

import type { LoraScanResult } from '../shared/artifacts.js';
import { ProviderFatalError } from '../shared/provider.js';
import type { LoraDatasetDatasetConfig } from '../shared/schema.js';
import type { LoraDatasetWorkspace } from '../shared/workspace.js';
import { createTestExecutionContext, PLATFORM_CONFIG } from './_test-helpers.js';

const { mockLoadScanContext, mockRunBatch, mockRunPreview } = vi.hoisted(() => ({
	mockLoadScanContext: vi.fn(),
	mockRunBatch: vi.fn(),
	mockRunPreview: vi.fn(),
}));

const { mockReadRememberedLoraDatasetPath, mockRememberLoraDatasetPath } = vi.hoisted(() => ({
	mockReadRememberedLoraDatasetPath: vi.fn(),
	mockRememberLoraDatasetPath: vi.fn(),
}));

const { mockPersistApiKeyToEnvironment } = vi.hoisted(() => ({
	mockPersistApiKeyToEnvironment: vi.fn(),
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

vi.mock('../shared/last-path.js', () => ({
	readRememberedLoraDatasetPath: mockReadRememberedLoraDatasetPath,
	rememberLoraDatasetPath: mockRememberLoraDatasetPath,
}));

vi.mock('../shared/api-key.js', async () => {
	const actual =
		await vi.importActual<typeof import('../shared/api-key.js')>('../shared/api-key.js');

	return {
		...actual,
		persistApiKeyToEnvironment: mockPersistApiKeyToEnvironment,
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
		mockReadRememberedLoraDatasetPath.mockReset();
		mockRememberLoraDatasetPath.mockReset();
		mockPersistApiKeyToEnvironment.mockReset();
		mockReadRememberedLoraDatasetPath.mockReturnValue(null);
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
		expect(mockRememberLoraDatasetPath).toHaveBeenCalledWith('/tmp/empty-dataset');
	});

	test('uses the remembered dataset path when no initial path is provided', () => {
		mockReadRememberedLoraDatasetPath.mockReturnValue('/tmp/remembered-dataset');

		const store = createTestStore();

		expect(store.getState().pathInput).toBe('/tmp/remembered-dataset');
	});

	test('opens api-key input when preview fails on missing environment variable', async () => {
		mockRunPreview.mockRejectedValue(
			new ProviderFatalError('Missing required environment variable: TEST_LORA_API_KEY'),
		);

		const store = createTestStore();
		store.setState({
			step: 'previewing',
			scanResult: EMPTY_SCAN_RESULT,
			datasetConfig: DATASET_CONFIG,
			workspace: WORKSPACE,
		});

		await store.getState().actions.runPreview();

		expect(store.getState().step).toBe('api-key-input');
		expect(store.getState().apiKeyEnvName).toBe('TEST_LORA_API_KEY');
		expect(store.getState().errorMessage).toBeNull();
	});

	test('saves api key and resumes preview automatically', async () => {
		mockRunPreview
			.mockRejectedValueOnce(
				new ProviderFatalError('Missing required environment variable: TEST_LORA_API_KEY'),
			)
			.mockResolvedValueOnce({
				relativePath: 'image_0001.png',
				caption: 'A caption.',
				responseText: '{"caption":"A caption."}',
			});

		const store = createTestStore();
		store.setState({
			step: 'previewing',
			scanResult: {
				...EMPTY_SCAN_RESULT,
				images: [
					{
						absolutePath: '/tmp/empty-dataset/image_0001.png',
						relativePath: 'image_0001.png',
						captionPath: '/tmp/empty-dataset/image_0001.txt',
						rawResponsePath: '/tmp/empty-dataset/_lora_dataset/raw/1.json',
					},
				],
			},
			datasetConfig: DATASET_CONFIG,
			workspace: WORKSPACE,
		});

		await store.getState().actions.runPreview();
		store.getState().actions.setApiKeyInput('test-key-123');
		await store.getState().actions.submitApiKey();

		expect(mockPersistApiKeyToEnvironment).toHaveBeenCalledWith(
			'TEST_LORA_API_KEY',
			'test-key-123',
		);
		expect(store.getState().step).toBe('preview-result');
		expect(store.getState().previewResult?.caption).toBe('A caption.');
	});

	test('saves api key and resumes batch automatically', async () => {
		mockRunBatch
			.mockRejectedValueOnce(
				new ProviderFatalError('Missing required environment variable: TEST_LORA_API_KEY'),
			)
			.mockResolvedValueOnce({
				total: 1,
				statusCounts: { captioned: 1 },
				failed: [],
				summaryPath: '/tmp/empty-dataset/_lora_dataset/run-summary.json',
				failedItemsPath: '/tmp/empty-dataset/_lora_dataset/failed-items.txt',
			});

		const store = createTestStore();
		store.setState({
			step: 'confirm',
			scanResult: {
				...EMPTY_SCAN_RESULT,
				images: [
					{
						absolutePath: '/tmp/empty-dataset/image_0001.png',
						relativePath: 'image_0001.png',
						captionPath: '/tmp/empty-dataset/image_0001.txt',
						rawResponsePath: '/tmp/empty-dataset/_lora_dataset/raw/1.json',
					},
				],
			},
			datasetConfig: DATASET_CONFIG,
			workspace: WORKSPACE,
		});

		await store.getState().actions.runBatch();
		store.getState().actions.setApiKeyInput('test-key-456');
		await store.getState().actions.submitApiKey();

		expect(mockPersistApiKeyToEnvironment).toHaveBeenCalledWith(
			'TEST_LORA_API_KEY',
			'test-key-456',
		);
		expect(store.getState().step).toBe('done');
		expect(store.getState().batchResult?.total).toBe(1);
	});
});

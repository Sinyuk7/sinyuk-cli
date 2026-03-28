import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { LoraScanResult } from '../shared/artifacts.js';
import type { BatchRunResult, PreviewResult } from '../shared/types.js';
import type { LoraDatasetDatasetConfig } from '../shared/schema.js';
import type { LoraDatasetWorkspace } from '../shared/workspace.js';
import { PLATFORM_CONFIG, createTestExecutionContext } from './_test-helpers.js';

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

import { runCaptionNonInteractive } from '../caption/run.js';

const SCAN_RESULT: LoraScanResult = {
	basePath: '/tmp/test-dataset',
	images: [
		{
			absolutePath: '/tmp/test-dataset/image_0001.png',
			relativePath: 'image_0001.png',
			captionPath: '/tmp/test-dataset/image_0001.txt',
			rawResponsePath: '/tmp/test-dataset/_lora_dataset/raw/1.json',
		},
		{
			absolutePath: '/tmp/test-dataset/image_0002.png',
			relativePath: 'image_0002.png',
			captionPath: '/tmp/test-dataset/image_0002.txt',
			rawResponsePath: '/tmp/test-dataset/_lora_dataset/raw/2.json',
		},
	],
	extensionCounts: {
		'.png': 2,
	},
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
	datasetPath: '/tmp/test-dataset',
	workDirPath: '/tmp/test-dataset/_lora_dataset',
	promptTemplatePath: '/tmp/home/features/lora-dataset/prompts/user-prompt.txt.example',
	configPath: '/tmp/test-dataset/_lora_dataset/config.yaml',
	promptPath: '/tmp/test-dataset/_lora_dataset/user-prompt.txt',
	runSummaryPath: '/tmp/test-dataset/_lora_dataset/run-summary.json',
	failedItemsPath: '/tmp/test-dataset/_lora_dataset/failed-items.txt',
	rawDirPath: '/tmp/test-dataset/_lora_dataset/raw',
};

/**
"""Create a capture buffer that behaves like command stdout.

INTENT: Keep runner output assertions focused on rendered lines instead of stream plumbing
INPUT: none
OUTPUT: writable-like object plus current text getter
SIDE EFFECT: None
FAILURE: None
"""
 */
function createCapturedStdout(): {
	stdout: { write: (chunk: string) => boolean };
	read: () => string;
} {
	let output = '';

	return {
		stdout: {
			write(chunk: string) {
				output += chunk;
				return true;
			},
		},
		read: () => output,
	};
}

describe('runCaptionNonInteractive', () => {
	beforeEach(() => {
		mockLoadScanContext.mockReset();
		mockRunBatch.mockReset();
		mockRunPreview.mockReset();
	});

	test('prints the preview-mode output contract', async () => {
		const preview: PreviewResult = {
			relativePath: 'image_0001.png',
			caption: 'A short caption.',
			responseText: '{"caption":"A short caption."}',
		};
		const captured = createCapturedStdout();

		mockLoadScanContext.mockResolvedValue({
			workspace: WORKSPACE,
			scanResult: {
				...SCAN_RESULT,
				images: [SCAN_RESULT.images[0]!],
				extensionCounts: { '.png': 1 },
			},
			datasetConfig: DATASET_CONFIG,
			promptPreviewLines: ['Prompt preview'],
		});
		mockRunPreview.mockResolvedValue(preview);

		const exitCode = await runCaptionNonInteractive({
			path: '/tmp/test-dataset',
			mode: 'preview',
			configSnapshot: PLATFORM_CONFIG,
			abortSignal: AbortSignal.timeout(5_000),
			createExecutionContext: () => createTestExecutionContext(),
			confirmFull: false,
			stdout: captured.stdout as never,
		});

		expect(exitCode).toBe(0);
		expect(captured.read()).toBe(
			'Result: Scanned 1 images.\nPreview: image_0001.png\nA short caption.\nResult: Preview complete.\n',
		);
	});

	test('prints progress lines and final result in full mode', async () => {
		const batchResult: BatchRunResult = {
			total: 2,
			statusCounts: { captioned: 2 },
			failed: [],
			summaryPath: '/tmp/test-dataset/_lora_dataset/run-summary.json',
			failedItemsPath: '/tmp/test-dataset/_lora_dataset/failed-items.txt',
		};
		const captured = createCapturedStdout();

		mockLoadScanContext.mockResolvedValue({
			workspace: WORKSPACE,
			scanResult: SCAN_RESULT,
			datasetConfig: DATASET_CONFIG,
			promptPreviewLines: ['Prompt preview'],
		});
		mockRunBatch.mockImplementation(
			async (options: { onProgress?: (progress: unknown) => void }) => {
				options.onProgress?.({
					total: 2,
					completed: 0,
					failed: 0,
					activeWorkers: [],
					statusCounts: {},
					slowdownActive: false,
				});
				options.onProgress?.({
					total: 2,
					completed: 1,
					failed: 0,
					activeWorkers: [{ slot: 1, key: 'image_0001.png', attempt: 1, startedAt: 0 }],
					statusCounts: { captioned: 1 },
					slowdownActive: false,
				});
				return batchResult;
			},
		);

		const exitCode = await runCaptionNonInteractive({
			path: '/tmp/test-dataset',
			mode: 'full',
			configSnapshot: PLATFORM_CONFIG,
			abortSignal: AbortSignal.timeout(5_000),
			createExecutionContext: () => createTestExecutionContext(),
			confirmFull: true,
			stdout: captured.stdout as never,
		});

		expect(exitCode).toBe(0);
		expect(captured.read()).toBe(
			'[0/2] Starting... failed=0\n[1/2] image_0001.png failed=0\nResult: Captioned 2 images, failed 0.\n',
		);
	});

	test('fails fast with NO_IMAGES_FOUND when scan result is empty', async () => {
		mockLoadScanContext.mockResolvedValue({
			workspace: WORKSPACE,
			scanResult: {
				...SCAN_RESULT,
				images: [],
				extensionCounts: {},
			},
			datasetConfig: DATASET_CONFIG,
			promptPreviewLines: ['Prompt preview'],
		});

		await expect(
			runCaptionNonInteractive({
				path: '/tmp/test-dataset',
				mode: 'preview',
				configSnapshot: PLATFORM_CONFIG,
				abortSignal: AbortSignal.timeout(5_000),
				createExecutionContext: () => createTestExecutionContext(),
				confirmFull: false,
				stdout: createCapturedStdout().stdout as never,
			}),
		).rejects.toMatchObject({
			code: 'NO_IMAGES_FOUND',
		});
	});
});

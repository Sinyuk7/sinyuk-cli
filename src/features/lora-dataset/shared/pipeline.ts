import { randomInt } from 'node:crypto';

import type { ExecutionContext } from '../../../platform/execution-context.js';
import {
	buildCropOutputDirectory,
	buildCropOutputImagePath,
	buildCropOutputTextPath,
	copyCaptionIfPresent,
	cropImageToPath,
	discoverLoraImages,
	fileExists,
	isValidTextArtifact,
	type LoraScanResult,
	writeCaptionArtifacts,
	writeFailedItems,
	writeRunSummary,
} from './artifacts.js';
import { ensureLoraDatasetPromptReady } from './bootstrap.js';
import {
	createProviderCircuitBreakerState,
	isRetryableProviderError,
	loadUserPrompt,
	readApiKey,
	readUserPromptPreview,
	requestCaptionForImage,
} from './provider.js';
import { runScheduledTasks, type FailedTask, type SchedulerProgress } from './scheduler.js';
import type {
	LoraDatasetCropProfile,
	LoraDatasetDatasetConfig,
	LoraDatasetFeatureConfig,
} from './schema.js';
import { loadLoraDatasetDatasetConfig } from './schema.js';
import type {
	BatchRunResult,
	CropPlanSpecProgress,
	CropRunResult,
	CropSpec,
	MultiCropRunResult,
	PreviewResult,
} from './types.js';
import type { LoraDatasetWorkspace } from './workspace.js';

function ensureNotAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new Error('Operation cancelled.');
	}
}

function formatFailedLines(failed: FailedTask[]): string[] {
	return failed.map((item) => `${item.key}\t${item.reason}`);
}

function choosePreviewImage(
	scanResult: LoraScanResult,
	previewFile: string | null,
): LoraScanResult['images'][number] {
	if (scanResult.images.length === 0) {
		throw new Error(`No supported images found in ${scanResult.basePath}`);
	}

	if (!previewFile) {
		return scanResult.images[randomInt(0, scanResult.images.length)];
	}

	const selected = scanResult.images.find((item) => item.relativePath === previewFile);
	if (!selected) {
		throw new Error(`Preview file not found under path: ${previewFile}`);
	}

	return selected;
}

/**
"""Load scan output and prompt preview lines for the lora-dataset feature.

INTENT: Build the shared scan context once so interactive and CLI flows use the same dataset snapshot
INPUT: pathInput
OUTPUT: { workspace, scanResult, promptPreviewLines }
SIDE EFFECT: Bootstrap dataset-local prompt state, read image files from disk, and read the local prompt file
FAILURE: Throw Error when bootstrap, scanning, or prompt preview loading fails
"""
 */
export async function loadScanContext(options: {
	pathInput: string;
}): Promise<{
	workspace: LoraDatasetWorkspace;
	scanResult: LoraScanResult;
	datasetConfig: LoraDatasetDatasetConfig;
	promptPreviewLines: string[];
}> {
	const workspace = await ensureLoraDatasetPromptReady(options.pathInput);
	const datasetConfig = loadLoraDatasetDatasetConfig(workspace.configPath);
	const scanResult = await discoverLoraImages(options.pathInput);
	const promptPreviewLines = await readUserPromptPreview(workspace.promptPath);
	return { workspace, scanResult, datasetConfig, promptPreviewLines };
}

/**
"""Execute a single preview caption request without writing dataset artifacts.

INTENT: Reuse the production provider path for one sampled image so users can validate prompt quality early
INPUT: scanResult, config, executionContext, previewFile
OUTPUT: PreviewResult
SIDE EFFECT: Read prompt and provider credentials, call the configured caption provider, emit one log event
FAILURE: Throw Error when no preview image exists, prompt/api key is invalid, or provider request fails
"""
 */
export async function runPreview(options: {
	scanResult: LoraScanResult;
	config: LoraDatasetFeatureConfig;
	datasetConfig: LoraDatasetDatasetConfig;
	workspace: LoraDatasetWorkspace;
	executionContext: ExecutionContext;
	previewFile: string | null;
}): Promise<PreviewResult> {
	const image = choosePreviewImage(options.scanResult, options.previewFile);
	const prompt = await loadUserPrompt(options.workspace.promptPath);
	const apiKey = readApiKey(options.config.provider, options.executionContext.envSnapshot);
	const result = await requestCaptionForImage({
		imagePath: image.absolutePath,
		userPrompt: prompt,
		featureConfig: options.config,
		datasetConfig: options.datasetConfig,
		apiKey,
		abortSignal: options.executionContext.abortSignal,
	});

	options.executionContext.logger.info('lora-dataset:preview', {
		file: image.relativePath,
	});

	return {
		relativePath: image.relativePath,
		caption: result.caption,
		responseText: result.responseText,
	};
}

async function captionOneImage(options: {
	item: LoraScanResult['images'][number] & { key: string };
	prompt: string;
	config: LoraDatasetFeatureConfig;
	datasetConfig: LoraDatasetDatasetConfig;
	executionContext: ExecutionContext;
	apiKey: string;
	circuitBreakerState: ReturnType<typeof createProviderCircuitBreakerState>;
}): Promise<{ status: 'skipped' | 'captioned' }> {
	if (await isValidTextArtifact(options.item.captionPath)) {
		return { status: 'skipped' };
	}

	const result = await requestCaptionForImage({
		imagePath: options.item.absolutePath,
		userPrompt: options.prompt,
		featureConfig: options.config,
		datasetConfig: options.datasetConfig,
		apiKey: options.apiKey,
		abortSignal: options.executionContext.abortSignal,
		circuitBreakerState: options.circuitBreakerState,
	});
	await writeCaptionArtifacts({
		image: options.item,
		caption: result.caption,
		rawResponse: result.rawResponse,
	});
	return { status: 'captioned' };
}

/**
"""Execute the caption batch pipeline with deterministic rerun behavior.

INTENT: Caption every discovered image through the shared scheduler while preserving completed artifacts on rerun
INPUT: scanResult, config, executionContext, concurrencyOverride, onProgress
OUTPUT: BatchRunResult
SIDE EFFECT: Read prompt and provider credentials, call the provider, write caption artifacts, failed-items.txt, and run-summary.json
FAILURE: Throw Error when prompt/api key is invalid, scheduling fails, provider calls fail fatally, or summary writes fail
"""
 */
export async function runBatch(options: {
	scanResult: LoraScanResult;
	config: LoraDatasetFeatureConfig;
	datasetConfig: LoraDatasetDatasetConfig;
	workspace: LoraDatasetWorkspace;
	executionContext: ExecutionContext;
	concurrencyOverride: number | null;
	onProgress?: (progress: SchedulerProgress) => void;
}): Promise<BatchRunResult> {
	const prompt = await loadUserPrompt(options.workspace.promptPath);
	const apiKey = readApiKey(options.config.provider, options.executionContext.envSnapshot);
	const circuitBreakerState = createProviderCircuitBreakerState();
	const queueResult = await runScheduledTasks({
		items: options.scanResult.images.map((item) => ({ ...item, key: item.relativePath })),
		concurrency: options.concurrencyOverride ?? options.config.scheduler.concurrency,
		maxRetries: options.config.scheduler.maxRetries,
		retryBaseDelayMs: options.config.scheduler.retryBaseDelayMs,
		retryMaxDelayMs: options.config.scheduler.retryMaxDelayMs,
		abortSignal: options.executionContext.abortSignal,
		isRetryableError: isRetryableProviderError,
		onProgress: options.onProgress,
		runTask: async (item) =>
			captionOneImage({
				item,
				prompt,
				config: options.config,
				datasetConfig: options.datasetConfig,
				executionContext: options.executionContext,
				apiKey,
				circuitBreakerState,
			}),
	});

	const failedItemsPath = options.workspace.failedItemsPath;
	const summaryPath = options.workspace.runSummaryPath;
	await writeFailedItems(options.scanResult.basePath, formatFailedLines(queueResult.failed));
	await writeRunSummary(options.scanResult.basePath, {
		phase: 'batch',
		total: queueResult.total,
		statusCounts: queueResult.statusCounts,
		failedCount: queueResult.failed.length,
		failedItemsPath,
		summaryPath,
	});

	return {
		total: queueResult.total,
		statusCounts: queueResult.statusCounts,
		failed: queueResult.failed,
		summaryPath,
		failedItemsPath,
	};
}

async function cropOneImage(options: {
	index: number;
	image: LoraScanResult['images'][number];
	outputDir: string;
	profile: LoraDatasetCropProfile;
}): Promise<{
	cropped: number;
	skippedExisting: number;
	copiedTxt: number;
	missingTxt: number;
}> {
	const outputImagePath = buildCropOutputImagePath(options.outputDir, options.index + 1);
	const outputTextPath = buildCropOutputTextPath(options.outputDir, options.index + 1);

	if (await fileExists(outputImagePath)) {
		const copied = await copyCaptionIfPresent({
			sourceCaptionPath: options.image.captionPath,
			outputCaptionPath: outputTextPath,
		});
		return {
			cropped: 0,
			skippedExisting: 1,
			copiedTxt: copied ? 1 : 0,
			missingTxt: copied ? 0 : 1,
		};
	}

	await cropImageToPath({
		sourcePath: options.image.absolutePath,
		outputPath: outputImagePath,
		profile: options.profile,
	});
	const copied = await copyCaptionIfPresent({
		sourceCaptionPath: options.image.captionPath,
		outputCaptionPath: outputTextPath,
	});
	return {
		cropped: 1,
		skippedExisting: 0,
		copiedTxt: copied ? 1 : 0,
		missingTxt: copied ? 0 : 1,
	};
}

/**
"""Generate cropped dataset outputs into a deterministic profile-specific directory.

INTENT: Create a clean crop output set that stays aligned with existing captions and can be resumed safely
INPUT: scanResult, profile, abortSignal, onProgress
OUTPUT: CropRunResult
SIDE EFFECT: Read source images and captions, write cropped images and copied caption files into the crop output directory
FAILURE: Throw Error when the run is aborted or filesystem/image processing fails before a per-item error can be captured
"""
 */
export async function runCrop(options: {
	scanResult: LoraScanResult;
	profile: LoraDatasetCropProfile;
	abortSignal: AbortSignal;
	onProgress?: (progress: { current: number; total: number; file: string }) => void;
}): Promise<CropRunResult> {
	const outputDir = buildCropOutputDirectory(options.scanResult.basePath, options.profile);
	const result: CropRunResult = {
		outputDir,
		total: options.scanResult.images.length,
		cropped: 0,
		skippedExisting: 0,
		missingTxt: 0,
		copiedTxt: 0,
		failed: [],
	};

	for (const [index, image] of options.scanResult.images.entries()) {
		ensureNotAborted(options.abortSignal);
		options.onProgress?.({
			current: index + 1,
			total: options.scanResult.images.length,
			file: image.relativePath,
		});

		try {
			const itemResult = await cropOneImage({
				index,
				image,
				outputDir,
				profile: options.profile,
			});
			result.cropped += itemResult.cropped;
			result.skippedExisting += itemResult.skippedExisting;
			result.copiedTxt += itemResult.copiedTxt;
			result.missingTxt += itemResult.missingTxt;
		} catch (error) {
			result.failed.push({
				key: image.relativePath,
				reason: (error as Error).message,
				attempts: 1,
			});
		}
	}

	return result;
}

/**
"""Execute the full ordered crop plan one spec at a time.

INTENT: Reuse the single-spec crop primitive while giving the planner one canonical multi-spec execution path
INPUT: scanResult, specs, abortSignal, onSpecStart, onImageProgress
OUTPUT: MultiCropRunResult
SIDE EFFECT: Read source images and captions, write crop outputs for each spec directory
FAILURE: Throw Error when the run is aborted or a spec-level execution fails before per-item capture
"""
 */
export async function runCropPlan(options: {
	scanResult: LoraScanResult;
	specs: CropSpec[];
	abortSignal: AbortSignal;
	onSpecStart?: (progress: CropPlanSpecProgress) => void;
	onImageProgress?: (progress: {
		current: number;
		total: number;
		file: string;
	}) => void;
}): Promise<MultiCropRunResult> {
	const specRuns: MultiCropRunResult['specRuns'] = [];

	for (const [index, spec] of options.specs.entries()) {
		ensureNotAborted(options.abortSignal);
		options.onSpecStart?.({
			current: index + 1,
			total: options.specs.length,
			spec,
		});

		const result = await runCrop({
			scanResult: options.scanResult,
			profile: {
				ratio: spec.ratio,
				longEdge: spec.longEdge,
			},
			abortSignal: options.abortSignal,
			onProgress: options.onImageProgress,
		});

		specRuns.push({ spec, result });
	}

	const failedSpecs = specRuns.filter((item) => item.result.failed.length > 0).length;
	return {
		totalSpecs: specRuns.length,
		failedSpecs,
		hasFailures: failedSpecs > 0,
		specRuns,
	};
}

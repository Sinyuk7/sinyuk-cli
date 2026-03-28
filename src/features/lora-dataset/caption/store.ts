import { createStore } from 'zustand/vanilla';

import type { PlatformConfig } from '../../../platform/config/schema.js';
import type { EntryMode, ExecutionContext } from '../../../platform/execution-context.js';
import type { LoraScanResult } from '../shared/artifacts.js';
import { isMissingApiKeyError, persistApiKeyToEnvironment } from '../shared/api-key.js';
import { readRememberedLoraDatasetPath, rememberLoraDatasetPath } from '../shared/last-path.js';
import { loadScanContext, runBatch, runPreview } from '../shared/pipeline.js';
import { getLoraDatasetFeatureConfig, type LoraDatasetDatasetConfig } from '../shared/schema.js';
import type { BatchRunResult, PreviewResult } from '../shared/types.js';
import type { SchedulerProgress } from '../shared/scheduler.js';
import type { LoraDatasetWorkspace } from '../shared/workspace.js';

type CaptionStep =
	| 'input'
	| 'scanning'
	| 'empty'
	| 'api-key-input'
	| 'previewing'
	| 'preview-result'
	| 'confirm'
	| 'running'
	| 'done'
	| 'error';

export type CaptionState = {
	step: CaptionStep;
	pathInput: string;
	apiKeyInput: string;
	apiKeyEnvName: string | null;
	promptPreviewLines: string[];
	datasetConfig: LoraDatasetDatasetConfig | null;
	workspace: LoraDatasetWorkspace | null;
	scanResult: LoraScanResult | null;
	previewResult: PreviewResult | null;
	batchResult: BatchRunResult | null;
	progress: SchedulerProgress | null;
	errorMessage: string | null;
	exited: boolean;
};

export type CaptionActions = {
	setPathInput: (value: string) => void;
	setApiKeyInput: (value: string) => void;
	startScan: (path?: string) => Promise<void>;
	returnToInput: () => void;
	runPreview: () => Promise<void>;
	openConfirm: () => void;
	runBatch: () => Promise<void>;
	submitApiKey: () => Promise<void>;
	retryFromError: () => void;
	complete: () => number;
};

export type CaptionStore = CaptionState & { actions: CaptionActions };

export type CreateCaptionStoreOptions = {
	configSnapshot: Readonly<PlatformConfig>;
	abortSignal: AbortSignal;
	entryMode: EntryMode;
	createExecutionContext: (options: { entryMode: EntryMode; dryRun: boolean }) => ExecutionContext;
	initialPath?: string;
	previewFile?: string | null;
	concurrencyOverride?: number | null;
};

/**
 * Create the Zustand store for the caption Action.
 *
 * INTENT: Module-level singleton managing caption workflow step transitions
 * INPUT: config, signals, context factory
 * OUTPUT: Zustand vanilla store
 * SIDE EFFECT: Actions trigger scan/preview/batch via shared pipeline
 * FAILURE: Actions catch errors and transition to 'error' step
 */
export function createCaptionStore(options: CreateCaptionStoreOptions) {
	const config = getLoraDatasetFeatureConfig(options.configSnapshot);
	const rememberedPath = readRememberedLoraDatasetPath();
	let returnStep: Exclude<CaptionStep, 'error'> = 'input';
	let pendingResumeAction: 'preview' | 'batch' | null = null;

	const failTo = (
		set: (partial: Partial<CaptionState>) => void,
		message: string,
		from: Exclude<CaptionStep, 'error'>,
	) => {
		returnStep = from;
		set({ step: 'error', errorMessage: message });
	};

	return createStore<CaptionStore>((set, get) => ({
		step: 'input',
		pathInput: options.initialPath ?? rememberedPath ?? process.cwd(),
		apiKeyInput: '',
		apiKeyEnvName: null,
		promptPreviewLines: [],
		datasetConfig: null,
		workspace: null,
		scanResult: null,
		previewResult: null,
		batchResult: null,
		progress: null,
		errorMessage: null,
		exited: false,

		actions: {
			setPathInput(value) {
				set({ pathInput: value });
			},

			setApiKeyInput(value) {
				set({ apiKeyInput: value, errorMessage: null });
			},

			async startScan(path) {
				const pathInput = path ?? get().pathInput;
				set({
					step: 'scanning',
					pathInput,
					apiKeyInput: '',
					apiKeyEnvName: null,
					errorMessage: null,
					previewResult: null,
					batchResult: null,
				});
				try {
					const loaded = await loadScanContext({ pathInput });
					rememberLoraDatasetPath(loaded.scanResult.basePath);
					if (loaded.scanResult.images.length === 0) {
						set({
							step: 'empty',
							datasetConfig: loaded.datasetConfig,
							workspace: loaded.workspace,
							scanResult: loaded.scanResult,
							promptPreviewLines: loaded.promptPreviewLines,
						});
						return;
					}

					set({
						step: 'previewing',
						datasetConfig: loaded.datasetConfig,
						workspace: loaded.workspace,
						scanResult: loaded.scanResult,
						promptPreviewLines: loaded.promptPreviewLines,
					});
				} catch (error) {
					failTo(set, (error as Error).message, 'input');
				}
			},

			returnToInput() {
				set({
					step: 'input',
					scanResult: null,
					previewResult: null,
					batchResult: null,
					progress: null,
					apiKeyInput: '',
					apiKeyEnvName: null,
					errorMessage: null,
				});
			},

			async runPreview() {
				const { scanResult, datasetConfig, workspace } = get();
				if (!scanResult || !datasetConfig || !workspace) return;
				set({ step: 'previewing', errorMessage: null });
				try {
					const previewResult = await runPreview({
						scanResult,
						config,
						datasetConfig,
						workspace,
						executionContext: options.createExecutionContext({
							entryMode: options.entryMode,
							dryRun: false,
						}),
						previewFile: options.previewFile ?? null,
					});
					set({ step: 'preview-result', previewResult });
				} catch (error) {
					if (isMissingApiKeyError(error, config.provider.apiKeyEnv)) {
						pendingResumeAction = 'preview';
						set({
							step: 'api-key-input',
							apiKeyInput: '',
							apiKeyEnvName: config.provider.apiKeyEnv,
							errorMessage: null,
						});
						return;
					}

					failTo(set, (error as Error).message, 'input');
				}
			},

			openConfirm() {
				set({ step: 'confirm', errorMessage: null });
			},

			async runBatch() {
				const { scanResult, datasetConfig, workspace } = get();
				if (!scanResult || !datasetConfig || !workspace) return;
				set({ step: 'running', progress: null, errorMessage: null });
				try {
					const batchResult = await runBatch({
						scanResult,
						config,
						datasetConfig,
						workspace,
						executionContext: options.createExecutionContext({
							entryMode: options.entryMode,
							dryRun: false,
						}),
						concurrencyOverride: options.concurrencyOverride ?? null,
						onProgress: (progress) => set({ progress }),
					});
					set({ step: 'done', batchResult, progress: null });
				} catch (error) {
					if (isMissingApiKeyError(error, config.provider.apiKeyEnv)) {
						pendingResumeAction = 'batch';
						set({
							step: 'api-key-input',
							apiKeyInput: '',
							apiKeyEnvName: config.provider.apiKeyEnv,
							progress: null,
							errorMessage: null,
						});
						return;
					}

					failTo(set, (error as Error).message, 'confirm');
				}
			},

			async submitApiKey() {
				const { apiKeyInput, apiKeyEnvName } = get();
				const nextApiKey = apiKeyInput.trim();
				if (!apiKeyEnvName) {
					set({ errorMessage: 'Missing target environment variable name.' });
					return;
				}

				if (nextApiKey.length === 0) {
					set({ errorMessage: 'API key cannot be empty.' });
					return;
				}

				try {
					await persistApiKeyToEnvironment(apiKeyEnvName, nextApiKey);
					const resumeAction = pendingResumeAction;
					pendingResumeAction = null;
					set({
						apiKeyInput: '',
						apiKeyEnvName: null,
						errorMessage: null,
					});

					if (resumeAction === 'batch') {
						await get().actions.runBatch();
						return;
					}

					await get().actions.runPreview();
				} catch (error) {
					set({ errorMessage: `Failed to save API key: ${(error as Error).message}` });
				}
			},

			retryFromError() {
				set({ step: returnStep, errorMessage: null });
			},

			complete() {
				const state = get();
				const exitCode = state.batchResult?.failed.length ? 2 : 0;
				if (state.exited) return exitCode;
				set({ exited: true });
				return exitCode;
			},
		},
	}));
}

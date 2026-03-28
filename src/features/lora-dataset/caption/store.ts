import { createStore } from 'zustand/vanilla';

import type { PlatformConfig } from '../../../platform/config/schema.js';
import type { EntryMode, ExecutionContext } from '../../../platform/execution-context.js';
import type { LoraScanResult } from '../shared/artifacts.js';
import { LoraDatasetBootstrapPauseError } from '../shared/bootstrap.js';
import { loadScanContext, runBatch, runPreview } from '../shared/pipeline.js';
import { getLoraDatasetFeatureConfig } from '../shared/schema.js';
import type { BatchRunResult, PreviewResult } from '../shared/types.js';
import type { SchedulerProgress } from '../shared/scheduler.js';
import type { LoraDatasetWorkspace } from '../shared/workspace.js';

type CaptionStep =
	| 'input'
	| 'scanning'
	| 'previewing'
	| 'preview-result'
	| 'confirm'
	| 'running'
	| 'bootstrap-paused'
	| 'done'
	| 'error';

export type CaptionState = {
	step: CaptionStep;
	pathInput: string;
	promptPreviewLines: string[];
	workspace: LoraDatasetWorkspace | null;
	scanResult: LoraScanResult | null;
	previewResult: PreviewResult | null;
	batchResult: BatchRunResult | null;
	progress: SchedulerProgress | null;
	pauseMessageLines: string[];
	errorMessage: string | null;
	exited: boolean;
};

export type CaptionActions = {
	setPathInput: (value: string) => void;
	startScan: (path?: string) => Promise<void>;
	runPreview: () => Promise<void>;
	openConfirm: () => void;
	runBatch: () => Promise<void>;
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
	let returnStep: Exclude<CaptionStep, 'error'> = 'input';

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
		pathInput: options.initialPath ?? process.cwd(),
		promptPreviewLines: [],
		workspace: null,
		scanResult: null,
		previewResult: null,
		batchResult: null,
		progress: null,
		pauseMessageLines: [],
		errorMessage: null,
		exited: false,

		actions: {
			setPathInput(value) {
				set({ pathInput: value });
			},

			async startScan(path) {
				const pathInput = path ?? get().pathInput;
				set({
					step: 'scanning',
					pathInput,
					errorMessage: null,
					previewResult: null,
					batchResult: null,
					pauseMessageLines: [],
				});
				try {
					const loaded = await loadScanContext({ pathInput });
					set({
						step: 'previewing',
						workspace: loaded.workspace,
						scanResult: loaded.scanResult,
						promptPreviewLines: loaded.promptPreviewLines,
					});
				} catch (error) {
					if (error instanceof LoraDatasetBootstrapPauseError) {
						set({
							step: 'bootstrap-paused',
							workspace: null,
							scanResult: null,
							previewResult: null,
							batchResult: null,
							progress: null,
							promptPreviewLines: [],
							pauseMessageLines: error.messageLines,
						});
						return;
					}

					failTo(set, (error as Error).message, 'input');
				}
			},

			async runPreview() {
				const { scanResult, workspace } = get();
				if (!scanResult || !workspace) return;
				set({ step: 'previewing', errorMessage: null });
				try {
					const previewResult = await runPreview({
						scanResult,
						config,
						workspace,
						executionContext: options.createExecutionContext({
							entryMode: options.entryMode,
							dryRun: false,
						}),
						previewFile: options.previewFile ?? null,
					});
					set({ step: 'preview-result', previewResult });
				} catch (error) {
					failTo(set, (error as Error).message, 'input');
				}
			},

			openConfirm() {
				set({ step: 'confirm', errorMessage: null });
			},

			async runBatch() {
				const { scanResult, workspace } = get();
				if (!scanResult || !workspace) return;
				set({ step: 'running', progress: null, errorMessage: null });
				try {
					const batchResult = await runBatch({
						scanResult,
						config,
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
					failTo(set, (error as Error).message, 'confirm');
				}
			},

			retryFromError() {
				set({ step: returnStep, errorMessage: null });
			},

			complete() {
				const state = get();
				const exitCode =
					state.step === 'bootstrap-paused' ? 1 : state.batchResult?.failed.length ? 2 : 0;
				if (state.exited) return exitCode;
				set({ exited: true });
				return exitCode;
			},
		},
	}));
}

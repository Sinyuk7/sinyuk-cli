import { createStore } from 'zustand/vanilla';

import type { PlatformConfig } from '../../../platform/config/schema.js';
import type { LoraScanResult } from '../shared/artifacts.js';
import { LoraDatasetBootstrapPauseError } from '../shared/bootstrap.js';
import { loadScanContext, runCrop } from '../shared/pipeline.js';
import {
	formatCropProfileId,
	getLoraDatasetFeatureConfig,
	type LoraDatasetCropProfile,
} from '../shared/schema.js';
import { writeRunSummary } from '../shared/artifacts.js';
import type { CropRunResult } from '../shared/types.js';
import type { LoraDatasetWorkspace } from '../shared/workspace.js';

type CropStep =
	| 'input'
	| 'scanning'
	| 'profile'
	| 'running'
	| 'bootstrap-paused'
	| 'done'
	| 'error';

export type CropState = {
	step: CropStep;
	pathInput: string;
	workspace: LoraDatasetWorkspace | null;
	scanResult: LoraScanResult | null;
	cropProfiles: LoraDatasetCropProfile[];
	selectedProfileId: string | null;
	cropResult: CropRunResult | null;
	cropProgress: { current: number; total: number; file: string } | null;
	pauseMessageLines: string[];
	errorMessage: string | null;
	exited: boolean;
};

export type CropActions = {
	setPathInput: (value: string) => void;
	startScan: (path?: string) => Promise<void>;
	selectProfile: (profileId: string) => void;
	runCrop: () => Promise<void>;
	retryFromError: () => void;
	complete: () => number;
};

export type CropStore = CropState & { actions: CropActions };

export type CreateCropStoreOptions = {
	configSnapshot: Readonly<PlatformConfig>;
	abortSignal: AbortSignal;
	initialPath?: string;
};

/**
 * Create the Zustand store for the crop Action.
 *
 * INTENT: Module-level singleton managing crop workflow step transitions
 * INPUT: config, abortSignal
 * OUTPUT: Zustand vanilla store
 * SIDE EFFECT: Actions trigger scan/crop via shared pipeline
 * FAILURE: Actions catch errors and transition to 'error' step
 */
export function createCropStore(options: CreateCropStoreOptions) {
	const config = getLoraDatasetFeatureConfig(options.configSnapshot);
	const defaultProfileId = formatCropProfileId(config.cropProfiles[0]);
	let returnStep: Exclude<CropStep, 'error'> = 'input';

	const failTo = (
		set: (partial: Partial<CropState>) => void,
		message: string,
		from: Exclude<CropStep, 'error'>,
	) => {
		returnStep = from;
		set({ step: 'error', errorMessage: message });
	};

	return createStore<CropStore>((set, get) => ({
		step: 'input',
		pathInput: options.initialPath ?? process.cwd(),
		workspace: null,
		scanResult: null,
		cropProfiles: config.cropProfiles,
		selectedProfileId: defaultProfileId,
		cropResult: null,
		cropProgress: null,
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
					cropResult: null,
					pauseMessageLines: [],
				});
				try {
					const loaded = await loadScanContext({ pathInput });
					set({
						step: 'profile',
						workspace: loaded.workspace,
						scanResult: loaded.scanResult,
						selectedProfileId: defaultProfileId,
					});
				} catch (error) {
					if (error instanceof LoraDatasetBootstrapPauseError) {
						set({
							step: 'bootstrap-paused',
							workspace: null,
							scanResult: null,
							cropResult: null,
							cropProgress: null,
							pauseMessageLines: error.messageLines,
						});
						return;
					}

					failTo(set, (error as Error).message, 'input');
				}
			},

			selectProfile(profileId) {
				set({ selectedProfileId: profileId });
			},

			async runCrop() {
				const { scanResult, selectedProfileId } = get();
				if (!scanResult) return;

				const profile = config.cropProfiles.find(
					(p) => formatCropProfileId(p) === selectedProfileId,
				);
				if (!profile) {
					failTo(set, 'No crop profile selected.', 'profile');
					return;
				}

				set({ step: 'running', cropProgress: null, errorMessage: null });
				try {
					const cropResult = await runCrop({
						scanResult,
						profile,
						abortSignal: options.abortSignal,
						onProgress: (cropProgress) => set({ cropProgress }),
					});
					await writeRunSummary(scanResult.basePath, {
						phase: 'completed',
						crop: cropResult,
					});
					set({ step: 'done', cropResult, cropProgress: null });
				} catch (error) {
					failTo(set, (error as Error).message, 'profile');
				}
			},

			retryFromError() {
				set({ step: returnStep, errorMessage: null });
			},

			complete() {
				const state = get();
				const exitCode =
					state.step === 'bootstrap-paused' ? 1 : state.cropResult?.failed.length ? 2 : 0;
				if (state.exited) return exitCode;
				set({ exited: true });
				return exitCode;
			},
		},
	}));
}

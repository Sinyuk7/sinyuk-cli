import { createStore } from 'zustand/vanilla';

import type { PlatformConfig } from '../../../platform/config/schema.js';
import type { LoraScanResult } from '../shared/artifacts.js';
import { readRememberedLoraDatasetPath, rememberLoraDatasetPath } from '../shared/last-path.js';
import { buildCropPlan, loadCropScanContext } from '../shared/crop-plan.js';
import { getLoraDatasetFeatureConfig } from '../shared/schema.js';
import type {
	CropPlanSpecProgress,
	CropRatioStat,
	CropSpec,
	MultiCropRunResult,
} from '../shared/types.js';
import { executeCropPlan } from './run.js';

type CropStep =
	| 'input'
	| 'scanning'
	| 'empty'
	| 'scan-preview'
	| 'ratio-select'
	| 'resolution-select'
	| 'confirm'
	| 'running'
	| 'done'
	| 'error';

export type CropState = {
	step: CropStep;
	pathInput: string;
	scanResult: LoraScanResult | null;
	ratioStats: CropRatioStat[];
	availableRatios: string[];
	availableResolutions: number[];
	selectedRatios: string[];
	resolutionByRatio: Record<string, number>;
	resolutionCursor: number;
	cropPlan: CropSpec[];
	runResult: MultiCropRunResult | null;
	currentSpecProgress: CropPlanSpecProgress | null;
	currentImageProgress: { current: number; total: number; file: string } | null;
	errorMessage: string | null;
	exited: boolean;
};

export type CropActions = {
	setPathInput: (value: string) => void;
	startScan: (path?: string) => Promise<void>;
	returnToInput: () => void;
	openRatioSelection: () => void;
	toggleRatio: (ratio: string) => void;
	setSelectedRatios: (values: string[]) => void;
	openResolutionSelection: () => void;
	setCurrentResolution: (resolution: number) => void;
	confirmResolutionSelection: () => void;
	runPlan: () => Promise<void>;
	retryFromError: () => void;
	complete: () => number;
};

export type CropStore = CropState & { actions: CropActions };

export type CreateCropStoreOptions = {
	configSnapshot: Readonly<PlatformConfig>;
	abortSignal: AbortSignal;
	initialPath?: string;
};

function orderSelectedRatios(
	availableRatios: string[],
	selectedRatios: string[],
	nextRatio: string,
): string[] {
	const nextSelected = selectedRatios.includes(nextRatio)
		? selectedRatios.filter((ratio) => ratio !== nextRatio)
		: [...selectedRatios, nextRatio];

	return availableRatios.filter((ratio) => nextSelected.includes(ratio));
}

/**
 * Create the Zustand store for the crop Action.
 *
 * INTENT: Module-level singleton managing the interactive crop planner workflow
 * INPUT: config snapshot and abort signal
 * OUTPUT: Zustand vanilla store
 * SIDE EFFECT: Actions trigger crop scan and multi-spec crop execution
 * FAILURE: Actions catch errors and transition to 'error' step
 */
export function createCropStore(options: CreateCropStoreOptions) {
	const config = getLoraDatasetFeatureConfig(options.configSnapshot);
	const rememberedPath = readRememberedLoraDatasetPath();
	const availableRatios = config.crop.ratioOptions;
	const availableResolutions = config.crop.resolutionOptions;
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
		pathInput: options.initialPath ?? rememberedPath ?? process.cwd(),
		scanResult: null,
		ratioStats: [],
		availableRatios,
		availableResolutions,
		selectedRatios: [],
		resolutionByRatio: {},
		resolutionCursor: 0,
		cropPlan: [],
		runResult: null,
		currentSpecProgress: null,
		currentImageProgress: null,
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
					scanResult: null,
					ratioStats: [],
					selectedRatios: [],
					resolutionByRatio: {},
					resolutionCursor: 0,
					cropPlan: [],
					runResult: null,
					currentSpecProgress: null,
					currentImageProgress: null,
					errorMessage: null,
				});

				try {
					const loaded = await loadCropScanContext({
						pathInput,
						ratioOptions: availableRatios,
					});
					rememberLoraDatasetPath(loaded.scanResult.basePath);
					if (loaded.scanResult.images.length === 0) {
						set({
							step: 'empty',
							scanResult: loaded.scanResult,
							ratioStats: loaded.ratioStats,
						});
						return;
					}

					set({
						step: 'scan-preview',
						scanResult: loaded.scanResult,
						ratioStats: loaded.ratioStats,
					});
				} catch (error) {
					failTo(set, (error as Error).message, 'input');
				}
			},

			returnToInput() {
				set({
					step: 'input',
					scanResult: null,
					ratioStats: [],
					selectedRatios: [],
					resolutionByRatio: {},
					resolutionCursor: 0,
					cropPlan: [],
					runResult: null,
					currentSpecProgress: null,
					currentImageProgress: null,
					errorMessage: null,
				});
			},

			openRatioSelection() {
				const { scanResult } = get();
				if (!scanResult || scanResult.images.length === 0) {
					failTo(set, 'No supported images found in the selected directory.', 'scan-preview');
					return;
				}

				set({ step: 'ratio-select', errorMessage: null });
			},

			toggleRatio(ratio) {
				const state = get();
				const selectedRatios = orderSelectedRatios(
					state.availableRatios,
					state.selectedRatios,
					ratio,
				);
				const resolutionByRatio = { ...state.resolutionByRatio };
				if (!selectedRatios.includes(ratio)) {
					delete resolutionByRatio[ratio];
				}

				set({
					selectedRatios,
					resolutionByRatio,
				});
			},

			setSelectedRatios(values) {
				const state = get();
				const selectedRatios = state.availableRatios.filter((ratio) => values.includes(ratio));
				const resolutionByRatio = Object.fromEntries(
					Object.entries(state.resolutionByRatio).filter(([ratio]) =>
						selectedRatios.includes(ratio),
					),
				);

				set({
					selectedRatios,
					resolutionByRatio,
				});
			},

			openResolutionSelection() {
				const { selectedRatios, availableResolutions, resolutionByRatio } = get();
				if (selectedRatios.length === 0) {
					failTo(set, 'Select at least one crop ratio before continuing.', 'ratio-select');
					return;
				}

				const nextResolutionByRatio = { ...resolutionByRatio };
				const firstRatio = selectedRatios[0];
				if (firstRatio && !nextResolutionByRatio[firstRatio]) {
					nextResolutionByRatio[firstRatio] = availableResolutions[0] ?? 0;
				}

				set({
					step: 'resolution-select',
					resolutionCursor: 0,
					resolutionByRatio: nextResolutionByRatio,
					errorMessage: null,
				});
			},

			setCurrentResolution(resolution) {
				const { selectedRatios, resolutionCursor, resolutionByRatio } = get();
				const currentRatio = selectedRatios[resolutionCursor];
				if (!currentRatio) {
					return;
				}

				set({
					resolutionByRatio: {
						...resolutionByRatio,
						[currentRatio]: resolution,
					},
				});
			},

			confirmResolutionSelection() {
				const {
					scanResult,
					selectedRatios,
					resolutionByRatio,
					resolutionCursor,
					availableResolutions,
				} = get();
				const currentRatio = selectedRatios[resolutionCursor];
				if (!scanResult || !currentRatio) {
					return;
				}

				const nextResolutionByRatio = { ...resolutionByRatio };
				if (!nextResolutionByRatio[currentRatio]) {
					nextResolutionByRatio[currentRatio] = availableResolutions[0] ?? 0;
				}

				const nextCursor = resolutionCursor + 1;
				if (nextCursor < selectedRatios.length) {
					const nextRatio = selectedRatios[nextCursor];
					if (nextRatio && !nextResolutionByRatio[nextRatio]) {
						nextResolutionByRatio[nextRatio] = availableResolutions[0] ?? 0;
					}

					set({
						step: 'resolution-select',
						resolutionCursor: nextCursor,
						resolutionByRatio: nextResolutionByRatio,
						errorMessage: null,
					});
					return;
				}

				try {
					const cropPlan = buildCropPlan({
						basePath: scanResult.basePath,
						selectedRatios,
						resolutionByRatio: nextResolutionByRatio,
					});

					set({
						step: 'confirm',
						resolutionByRatio: nextResolutionByRatio,
						cropPlan,
						errorMessage: null,
					});
				} catch (error) {
					failTo(set, (error as Error).message, 'resolution-select');
				}
			},

			async runPlan() {
				const { scanResult, cropPlan } = get();
				if (!scanResult || cropPlan.length === 0) {
					return;
				}

				set({
					step: 'running',
					runResult: null,
					currentSpecProgress: null,
					currentImageProgress: null,
					errorMessage: null,
				});

				try {
					const { runResult } = await executeCropPlan({
						scanResult,
						specs: cropPlan,
						abortSignal: options.abortSignal,
						onSpecStart: (currentSpecProgress) => set({ currentSpecProgress }),
						onImageProgress: (currentImageProgress) => set({ currentImageProgress }),
					});

					set({
						step: 'done',
						runResult,
						currentImageProgress: null,
					});
				} catch (error) {
					failTo(set, (error as Error).message, 'confirm');
				}
			},

			retryFromError() {
				set({ step: returnStep, errorMessage: null });
			},

			complete() {
				const state = get();
				const exitCode = state.runResult?.hasFailures ? 2 : 0;
				if (state.exited) {
					return exitCode;
				}

				set({ exited: true });
				return exitCode;
			},
		},
	}));
}

import type { FailedTask, SchedulerProgress } from './scheduler.js';

export type BatchRunResult = {
	total: number;
	statusCounts: Record<string, number>;
	failed: FailedTask[];
	summaryPath: string;
	failedItemsPath: string;
};

export type CropRunResult = {
	outputDir: string;
	total: number;
	cropped: number;
	skippedExisting: number;
	missingTxt: number;
	copiedTxt: number;
	failed: FailedTask[];
};

export type CropRatioStat = {
	ratio: string;
	count: number;
};

export type CropSpec = {
	ratio: string;
	longEdge: number;
	width: number;
	height: number;
	outputDir: string;
};

export type CropSpecRun = {
	spec: CropSpec;
	result: CropRunResult;
};

export type MultiCropRunResult = {
	totalSpecs: number;
	failedSpecs: number;
	hasFailures: boolean;
	specRuns: CropSpecRun[];
};

export type CropPlanSpecProgress = {
	current: number;
	total: number;
	spec: CropSpec;
};

export type PreviewResult = {
	relativePath: string;
	caption: string;
	responseText: string;
};

export type LoraDatasetPhase =
	| 'input'
	| 'scanning'
	| 'mode'
	| 'previewing'
	| 'preview-result'
	| 'full-confirm'
	| 'batch-running'
	| 'post-batch'
	| 'crop-select'
	| 'crop-running'
	| 'completed'
	| 'error';

export type LoraDatasetState = {
	phase: LoraDatasetPhase;
	pathInput: string;
	promptPreviewLines: string[];
	scanResult: import('./artifacts.js').LoraScanResult | null;
	previewResult: PreviewResult | null;
	batchResult: BatchRunResult | null;
	cropResult: CropRunResult | null;
	selectedCropProfileId: string | null;
	progress: SchedulerProgress | null;
	cropProgress: { current: number; total: number; file: string } | null;
	errorMessage: string | null;
	returnPhase: Exclude<LoraDatasetPhase, 'error'>;
};

export type LoraDatasetSession = {
	getState: () => LoraDatasetState;
	subscribe: (listener: (state: LoraDatasetState) => void) => () => void;
	setPathInput: (value: string) => void;
	scanPath: (value?: string) => Promise<void>;
	runPreview: () => Promise<void>;
	openFullConfirm: () => void;
	runFullBatch: () => Promise<void>;
	enterCropSelection: () => void;
	selectCropProfile: (profileId: string) => void;
	runCrop: () => Promise<void>;
	exitToCompletion: () => void;
	retryFromError: () => void;
	reset: () => void;
};

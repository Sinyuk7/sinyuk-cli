import type { LoraScanResult } from '../shared/artifacts.js';
import { writeRunSummary } from '../shared/artifacts.js';
import { runCropPlan } from '../shared/pipeline.js';
import type {
	CropPlanSpecProgress,
	CropSpec,
	MultiCropRunResult,
} from '../shared/types.js';

/**
"""Execute the planned crop specs and persist one multi-spec run summary.

INTENT: Keep interactive crop execution on one canonical runner that owns summary writing and exit-code rules
INPUT: scanResult, specs, abortSignal, optional progress callbacks
OUTPUT: { exitCode, runResult }
SIDE EFFECT: Executes crop output generation and writes run-summary.json under the dataset workspace
FAILURE: Throw Error when execution or summary writing fails
"""
 */
export async function executeCropPlan(options: {
	scanResult: LoraScanResult;
	specs: CropSpec[];
	abortSignal: AbortSignal;
	onSpecStart?: (progress: CropPlanSpecProgress) => void;
	onImageProgress?: (progress: {
		current: number;
		total: number;
		file: string;
	}) => void;
}): Promise<{
	exitCode: number;
	runResult: MultiCropRunResult;
}> {
	if (options.specs.length === 0) {
		throw new Error('Crop plan is empty. Select at least one crop spec.');
	}

	const runResult = await runCropPlan({
		scanResult: options.scanResult,
		specs: options.specs,
		abortSignal: options.abortSignal,
		onSpecStart: options.onSpecStart,
		onImageProgress: options.onImageProgress,
	});

	await writeRunSummary(options.scanResult.basePath, {
		phase: 'completed',
		crop: runResult,
	});

	return {
		exitCode: runResult.hasFailures ? 2 : 0,
		runResult,
	};
}

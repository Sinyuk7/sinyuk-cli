import type {
	LoraDatasetDatasetConfig,
	LoraDatasetFeatureConfig,
} from './schema.js';

export type CaptionExecutionPlanSummary = {
	effectiveConcurrency: number;
	estimatedMaxOutputTokens: number;
	lines: string[];
};

/**
"""Build a human-readable caption execution plan summary before provider calls.

INTENT: Surface request-cost-relevant settings so users can choose preview or full batch with explicit context
INPUT: imageCount, featureConfig, datasetConfig, concurrencyOverride
OUTPUT: CaptionExecutionPlanSummary
SIDE EFFECT: None
FAILURE: None
"""
 */
export function buildCaptionExecutionPlanSummary(options: {
	imageCount: number;
	featureConfig: LoraDatasetFeatureConfig;
	datasetConfig: LoraDatasetDatasetConfig;
	concurrencyOverride: number | null;
}): CaptionExecutionPlanSummary {
	const effectiveConcurrency = options.concurrencyOverride ?? options.featureConfig.scheduler.concurrency;
	const estimatedMaxOutputTokens = options.imageCount * options.datasetConfig.request.maxOutputTokens;

	return {
		effectiveConcurrency,
		estimatedMaxOutputTokens,
		lines: [
			`Images: ${options.imageCount}`,
			`Upload transform: fit-inside longEdge=${options.featureConfig.analysis.longEdge}px, jpegQuality=${options.featureConfig.analysis.jpegQuality}%`,
			`Request: temperature=${options.datasetConfig.request.temperature}, topP=${options.datasetConfig.request.topP}, maxOutputTokens=${options.datasetConfig.request.maxOutputTokens}`,
			`Batch token upper bound: ${options.datasetConfig.request.maxOutputTokens} x ${options.imageCount} = ${estimatedMaxOutputTokens}`,
			`Scheduler: concurrency=${effectiveConcurrency}, timeout=${options.featureConfig.scheduler.timeoutSeconds}s, retries=${options.featureConfig.scheduler.maxRetries}`,
		],
	};
}

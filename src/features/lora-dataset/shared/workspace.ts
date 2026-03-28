import { join, resolve } from 'node:path';

import { getFeatureHomePath } from '../../../platform/home.js';

const FEATURE_ID = 'lora-dataset';

export type LoraDatasetWorkspace = {
	datasetPath: string;
	workDirPath: string;
	promptTemplatePath: string;
	promptPath: string;
	runSummaryPath: string;
	failedItemsPath: string;
	rawDirPath: string;
};

/**
"""Convert a feature id into the standard dataset-local workspace directory name.

INTENT: Keep dataset-local mutable state isolated per feature using one deterministic naming rule
INPUT: featureId
OUTPUT: directory name like _lora_dataset
SIDE EFFECT: None
FAILURE: None
"""
 */
export function toFeatureWorkspaceDirName(featureId: string): string {
	return `_${featureId.replace(/-/g, '_')}`;
}

export function getLoraDatasetWorkspaceDirName(): string {
	return toFeatureWorkspaceDirName(FEATURE_ID);
}

/**
"""Resolve all dataset-local and user-home paths used by the lora-dataset feature.

INTENT: Centralize path derivation so caption, crop, bootstrap, and artifacts share one workspace contract
INPUT: datasetPath
OUTPUT: LoraDatasetWorkspace
SIDE EFFECT: None
FAILURE: None
"""
 */
export function resolveLoraDatasetWorkspace(datasetPath: string): LoraDatasetWorkspace {
	const resolvedDatasetPath = resolve(datasetPath);
	const workDirPath = join(resolvedDatasetPath, getLoraDatasetWorkspaceDirName());
	const featureHomePath = getFeatureHomePath(FEATURE_ID);

	return {
		datasetPath: resolvedDatasetPath,
		workDirPath,
		promptTemplatePath: join(featureHomePath, 'prompts', 'user-prompt.txt.example'),
		promptPath: join(workDirPath, 'user-prompt.txt'),
		runSummaryPath: join(workDirPath, 'run-summary.json'),
		failedItemsPath: join(workDirPath, 'failed-items.txt'),
		rawDirPath: join(workDirPath, 'raw'),
	};
}

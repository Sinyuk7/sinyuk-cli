import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { getFeatureHomePath } from '../../../platform/home.js';

const LAST_PATH_FILENAME = 'last-dataset-path.txt';

function getLastPathFilePath(): string {
	return resolve(getFeatureHomePath('lora-dataset'), LAST_PATH_FILENAME);
}

/**
"""Read the last successfully used lora-dataset directory from feature-home state.

INTENT: Restore the user's working context so repeated caption/crop sessions reopen on the same dataset by default
INPUT: none
OUTPUT: absolute dataset path or null when no remembered value exists
SIDE EFFECT: Read one small state file from the feature home directory
FAILURE: Return null when the state file is missing or empty
"""
 */
export function readRememberedLoraDatasetPath(): string | null {
	const filePath = getLastPathFilePath();
	if (!existsSync(filePath)) {
		return null;
	}

	const value = readFileSync(filePath, 'utf8').trim();
	if (value.length === 0) {
		return null;
	}

	return resolve(value);
}

/**
"""Persist the most recently successful lora-dataset directory into feature-home state.

INTENT: Keep caption and crop aligned on one shared last-used dataset path for the next interactive session
INPUT: datasetPath
OUTPUT: None
SIDE EFFECT: Create parent directories and write one state file under the feature home directory
FAILURE: Propagate filesystem errors when the state file cannot be written
"""
 */
export function rememberLoraDatasetPath(datasetPath: string): void {
	const filePath = getLastPathFilePath();
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${resolve(datasetPath)}\n`, 'utf8');
}

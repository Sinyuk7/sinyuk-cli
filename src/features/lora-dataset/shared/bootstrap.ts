import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';

import { copyLoraDatasetTemplateIfMissing } from './templates.js';
import type { LoraDatasetWorkspace } from './workspace.js';
import { resolveLoraDatasetWorkspace } from './workspace.js';

/**
"""Ensure the dataset-local config and prompt files exist before execution continues.

INTENT: Keep dataset bootstrap explicit while allowing users to run with either the default prompt or their own customized prompt
INPUT: datasetPath
OUTPUT: LoraDatasetWorkspace
SIDE EFFECT: May create the dataset-local workspace directory and copy the dataset config or prompt template into it
FAILURE: Propagate filesystem errors when workspace bootstrap cannot complete
"""
 */
export async function ensureLoraDatasetPromptReady(
	datasetPath: string,
): Promise<LoraDatasetWorkspace> {
	const workspace = resolveLoraDatasetWorkspace(datasetPath);
	await mkdir(workspace.workDirPath, { recursive: true });
	copyLoraDatasetTemplateIfMissing('datasetConfig', workspace.configPath);
	copyLoraDatasetTemplateIfMissing('userPrompt', workspace.promptTemplatePath);
	try {
		await copyFile(
			workspace.promptTemplatePath,
			workspace.promptPath,
			fsConstants.COPYFILE_EXCL,
		);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== 'EEXIST') {
			throw error;
		}
	}

	return workspace;
}

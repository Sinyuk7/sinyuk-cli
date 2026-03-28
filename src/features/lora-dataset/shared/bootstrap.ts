import { copyFile, mkdir, readFile } from 'node:fs/promises';

import type { LoraDatasetWorkspace } from './workspace.js';
import { resolveLoraDatasetWorkspace } from './workspace.js';

export class LoraDatasetBootstrapPauseError extends Error {
	readonly messageLines: string[];

	constructor(messageLines: string[]) {
		super(messageLines.join('\n'));
		this.name = 'LoraDatasetBootstrapPauseError';
		this.messageLines = messageLines;
	}
}

function normalizePromptText(content: string): string {
	return content.replace(/\r\n/g, '\n').trim();
}

function createBootstrapPauseLines(options: {
	promptPath: string;
	copiedTemplate: boolean;
}): string[] {
	if (options.copiedTemplate) {
		return [
			`[Info] No local prompt found in ${options.promptPath}`,
			`[Action] Copied template to ${options.promptPath}`,
			'[Warn] Execution paused.',
			'[Hint] Please edit the prompt file with your specific trigger words, then run this command again.',
		];
	}

	return [
		`[Warn] Local prompt is still using the template content: ${options.promptPath}`,
		'[Warn] Execution paused.',
		'[Hint] Please edit the prompt file with your specific trigger words, then run this command again.',
	];
}

/**
"""Ensure the dataset-local prompt exists and is customized before execution can continue.

INTENT: Fail fast for high-cost dataset runs so no batch work starts with an unedited template prompt
INPUT: datasetPath
OUTPUT: LoraDatasetWorkspace
SIDE EFFECT: May create the dataset-local workspace directory and copy the prompt template into it
FAILURE: Throw LoraDatasetBootstrapPauseError when bootstrap is required or the prompt is still unchanged
"""
 */
export async function ensureLoraDatasetPromptReady(
	datasetPath: string,
): Promise<LoraDatasetWorkspace> {
	const workspace = resolveLoraDatasetWorkspace(datasetPath);
	await mkdir(workspace.workDirPath, { recursive: true });

	const templateText = await readFile(workspace.promptTemplatePath, 'utf8');
	let promptText = '';

	try {
		promptText = await readFile(workspace.promptPath, 'utf8');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== 'ENOENT') {
			throw error;
		}

		await copyFile(workspace.promptTemplatePath, workspace.promptPath);
		throw new LoraDatasetBootstrapPauseError(
			createBootstrapPauseLines({
				promptPath: workspace.promptPath,
				copiedTemplate: true,
			}),
		);
	}

	if (normalizePromptText(promptText) === normalizePromptText(templateText)) {
		throw new LoraDatasetBootstrapPauseError(
			createBootstrapPauseLines({
				promptPath: workspace.promptPath,
				copiedTemplate: false,
			}),
		);
	}

	return workspace;
}

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Command, Option, UsageError } from 'clipanion';

import type { SinyukCliContext } from '../cli/context.js';
import { readLoraDatasetTemplate } from '../features/lora-dataset/shared/templates.js';
import { getFeatureConfigPath, getFeatureHomePath } from '../platform/home.js';

type LoraDatasetFeatureHomeTemplateTarget = {
	kind: 'featureConfig' | 'userPrompt';
	path: string;
};

export type ResetLoraDatasetFeatureFileResult = {
	path: string;
	backupPath: string | null;
};

export type ResetLoraDatasetFeatureFilesResult = {
	files: ResetLoraDatasetFeatureFileResult[];
};

function formatTimestampToken(date: Date): string {
	const year = String(date.getFullYear());
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function getLoraDatasetFeatureHomeTemplateTargets(
	sinyukHomePath?: string,
): LoraDatasetFeatureHomeTemplateTarget[] {
	const featureHomePath = getFeatureHomePath('lora-dataset', sinyukHomePath);

	return [
		{
			kind: 'featureConfig',
			path: getFeatureConfigPath('lora-dataset', sinyukHomePath),
		},
		{
			kind: 'userPrompt',
			path: join(featureHomePath, 'prompts', 'user-prompt.txt.example'),
		},
	];
}

/**
"""Reset all lora-dataset feature-home template files to the current bundled versions.

INTENT: Give users one explicit recovery command that can replace stale feature-home config and prompt templates after schema or prompt contract upgrades
INPUT: force flag, optional sinyuk home override, optional clock override
OUTPUT: { files }
SIDE EFFECT: Create directories, optionally copy existing files to timestamped backup files, and write the latest bundled templates to disk
FAILURE: Throw Error when overwrite is requested without force or filesystem operations fail
"""
 */
export function resetLoraDatasetFeatureFiles(options: {
	force: boolean;
	sinyukHomePath?: string;
	now?: Date;
}): ResetLoraDatasetFeatureFilesResult {
	const targets = getLoraDatasetFeatureHomeTemplateTargets(options.sinyukHomePath);
	const existingPaths = targets.filter((target) => existsSync(target.path)).map((target) => target.path);

	if (existingPaths.length > 0 && !options.force) {
		throw new Error(
			`Refusing to overwrite existing lora-dataset feature files: ${existingPaths.join(', ')}. Re-run with --force to back up and replace them.`,
		);
	}

	const timestamp = formatTimestampToken(options.now ?? new Date());
	const files = targets.map((target) => {
		mkdirSync(dirname(target.path), { recursive: true });

		let backupPath: string | null = null;
		if (existsSync(target.path)) {
			backupPath = `${target.path}.bak-${timestamp}`;
			copyFileSync(target.path, backupPath);
		}

		writeFileSync(target.path, readLoraDatasetTemplate(target.kind), 'utf8');
		return {
			path: target.path,
			backupPath,
		};
	});

	return { files };
}

export class ConfigResetLoraDatasetCommand extends Command<SinyukCliContext> {
	static override paths = [['config', 'reset', 'lora-dataset']];

	static override usage = Command.Usage({
		category: 'Config',
		description:
			'Reset the lora-dataset feature config and bundled prompt template to the latest versions',
		examples: [
			[
				'Back up and replace the lora-dataset feature config and prompt template',
				'$0 config reset lora-dataset --force',
			],
		],
	});

	readonly force = Option.Boolean('--force', false);

	override async execute(): Promise<number> {
		try {
			const result = resetLoraDatasetFeatureFiles({ force: this.force });

			for (const file of result.files) {
				if (file.backupPath) {
					this.context.stdout.write(`Backed up ${file.path} to ${file.backupPath}\n`);
				}
				this.context.stdout.write(`Reset ${file.path} to the latest template\n`);
			}

			return 0;
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes('Re-run with --force to back up and replace them.')
			) {
				throw new UsageError(error.message);
			}

			throw error;
		}
	}
}

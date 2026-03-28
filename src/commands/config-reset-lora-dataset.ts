import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { Command, Option, UsageError } from 'clipanion';

import type { SinyukCliContext } from '../cli/context.js';
import { readLoraDatasetTemplate } from '../features/lora-dataset/shared/templates.js';
import { getFeatureConfigPath } from '../platform/home.js';

function formatTimestampToken(date: Date): string {
	const year = String(date.getFullYear());
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export type ResetLoraDatasetFeatureConfigResult = {
	configPath: string;
	backupPath: string | null;
};

/**
"""Reset the lora-dataset feature config to the current bundled template.

INTENT: Give users one explicit recovery command that can replace stale feature config after schema upgrades
INPUT: force flag, optional sinyuk home override, optional clock override
OUTPUT: { configPath, backupPath }
SIDE EFFECT: Create directories, optionally copy an existing config to a backup file, and write the latest template to disk
FAILURE: Throw Error when overwrite is requested without force or filesystem operations fail
"""
 */
export function resetLoraDatasetFeatureConfig(options: {
	force: boolean;
	sinyukHomePath?: string;
	now?: Date;
}): ResetLoraDatasetFeatureConfigResult {
	const configPath = getFeatureConfigPath('lora-dataset', options.sinyukHomePath);
	const templateContent = readLoraDatasetTemplate('featureConfig');
	const hasExistingConfig = existsSync(configPath);

	if (hasExistingConfig && !options.force) {
		throw new Error(
			`Refusing to overwrite existing config at ${configPath}. Re-run with --force to back up and replace it.`,
		);
	}

	mkdirSync(dirname(configPath), { recursive: true });

	let backupPath: string | null = null;
	if (hasExistingConfig) {
		const timestamp = formatTimestampToken(options.now ?? new Date());
		backupPath = `${configPath}.bak-${timestamp}`;
		copyFileSync(configPath, backupPath);
	}

	writeFileSync(configPath, templateContent, 'utf8');
	return { configPath, backupPath };
}

export class ConfigResetLoraDatasetCommand extends Command<SinyukCliContext> {
	static override paths = [['config', 'reset', 'lora-dataset']];

	static override usage = Command.Usage({
		category: 'Config',
		description: 'Reset the lora-dataset feature config to the latest bundled template',
		examples: [
			[
				'Back up and replace the lora-dataset feature config',
				'$0 config reset lora-dataset --force',
			],
		],
	});

	readonly force = Option.Boolean('--force', false);

	override async execute(): Promise<number> {
		try {
			const result = resetLoraDatasetFeatureConfig({ force: this.force });

			if (result.backupPath) {
				this.context.stdout.write(`Backed up ${result.configPath} to ${result.backupPath}\n`);
			}
			this.context.stdout.write(`Reset ${result.configPath} to the latest template\n`);
			return 0;
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes('Re-run with --force to back up and replace it.')
			) {
				throw new UsageError(error.message);
			}

			throw error;
		}
	}
}

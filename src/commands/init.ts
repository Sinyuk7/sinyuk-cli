import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Command } from 'clipanion';

import type { SinyukCliContext } from '../cli/context.js';
import { copyLoraDatasetTemplateIfMissing } from '../features/lora-dataset/shared/templates.js';
import { getFeatureConfigPath, getFeatureHomePath, getGlobalConfigPath } from '../platform/home.js';

function buildInitialGlobalConfig(): string {
	return `logging:
  level: info
`;
}

function buildInitialHelloWorldConfig(): string {
	return `includeHidden: false
`;
}

function writeFileIfMissing(path: string, content: string): boolean {
	if (existsSync(path)) {
		return false;
	}

	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf8');
	return true;
}

export class InitCommand extends Command<SinyukCliContext> {
	static override paths = [['init']];

	static override usage = Command.Usage({
		category: 'General',
		description: 'Create SINYUK_HOME config and feature directories',
		examples: [['Create ~/.sinyuk-cli config and feature home files', '$0 init']],
	});

	override async execute(): Promise<number> {
		const globalPath = getGlobalConfigPath();
		const helloWorldConfigPath = getFeatureConfigPath('hello-world');
		const loraDatasetConfigPath = getFeatureConfigPath('lora-dataset');
		const loraPromptPath = join(
			getFeatureHomePath('lora-dataset'),
			'prompts',
			'user-prompt.txt.example',
		);

		const createdPaths = [
			writeFileIfMissing(globalPath, buildInitialGlobalConfig()) ? globalPath : null,
			writeFileIfMissing(helloWorldConfigPath, buildInitialHelloWorldConfig())
				? helloWorldConfigPath
				: null,
			copyLoraDatasetTemplateIfMissing('featureConfig', loraDatasetConfigPath)
				? loraDatasetConfigPath
				: null,
			copyLoraDatasetTemplateIfMissing('userPrompt', loraPromptPath) ? loraPromptPath : null,
		].filter((path): path is string => path !== null);

		if (createdPaths.length === 0) {
			this.context.stdout.write(`SINYUK_HOME is already initialized at ${dirname(globalPath)}\n`);
			return 0;
		}

		for (const path of createdPaths) {
			this.context.stdout.write(`Created ${path}\n`);
		}
		return 0;
	}
}

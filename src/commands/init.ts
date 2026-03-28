import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Command } from 'clipanion';

import type { SinyukCliContext } from '../cli/context.js';
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

function buildInitialLoraDatasetConfig(): string {
	return `provider:
  baseUrl: https://api.openai.com/v1
  model: gpt-4.1-mini
  apiKeyEnv: OPENAI_API_KEY
  concurrency: 4
  timeoutSeconds: 60
  maxRetries: 2
  analysisLongEdge: 1536
  analysisJpegQuality: 90
cropProfiles:
  - ratio: 1:1
    longEdge: 1024
  - ratio: 3:4
    longEdge: 1536
`;
}

function buildInitialLoraPrompt(): string {
	return `Return strict JSON only.

Describe the main subject first, then short visual details useful for LoRA training.
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
			writeFileIfMissing(loraDatasetConfigPath, buildInitialLoraDatasetConfig())
				? loraDatasetConfigPath
				: null,
			writeFileIfMissing(loraPromptPath, buildInitialLoraPrompt()) ? loraPromptPath : null,
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

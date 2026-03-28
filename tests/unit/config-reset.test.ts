import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { resetLoraDatasetFeatureFiles } from '../../src/commands/config-reset-lora-dataset.js';
import { readLoraDatasetTemplate } from '../../src/features/lora-dataset/shared/templates.js';
import { getFeatureConfigPath, getFeatureHomePath } from '../../src/platform/home.js';

function createTempDir(): string {
	return mkdtempSync(join(tmpdir(), 'sinyuk-cli-reset-test-'));
}

function getPromptTemplatePath(sinyukHomePath: string): string {
	return join(getFeatureHomePath('lora-dataset', sinyukHomePath), 'prompts', 'user-prompt.txt.example');
}

describe('resetLoraDatasetFeatureFiles', () => {
	test('creates the latest feature config and prompt template when missing', () => {
		const sinyukHomePath = createTempDir();

		const result = resetLoraDatasetFeatureFiles({
			force: false,
			sinyukHomePath,
			now: new Date('2026-03-28T22:50:00'),
		});

		const configPath = getFeatureConfigPath('lora-dataset', sinyukHomePath);
		const promptTemplatePath = getPromptTemplatePath(sinyukHomePath);

		expect(result.files).toEqual([
			{ path: configPath, backupPath: null },
			{ path: promptTemplatePath, backupPath: null },
		]);
		expect(readFileSync(configPath, 'utf8')).toBe(readLoraDatasetTemplate('featureConfig'));
		expect(readFileSync(promptTemplatePath, 'utf8')).toBe(readLoraDatasetTemplate('userPrompt'));
	});

	test('refuses to overwrite existing feature files without force', () => {
		const sinyukHomePath = createTempDir();
		const configPath = getFeatureConfigPath('lora-dataset', sinyukHomePath);
		const promptTemplatePath = getPromptTemplatePath(sinyukHomePath);

		mkdirSync(join(sinyukHomePath, 'features', 'lora-dataset', 'prompts'), { recursive: true });
		writeFileSync(configPath, 'provider:\n  baseUrl: https://api.openai.com/v1\n', 'utf8');
		writeFileSync(promptTemplatePath, 'old prompt template\n', 'utf8');

		expect(() =>
			resetLoraDatasetFeatureFiles({
				force: false,
				sinyukHomePath,
				now: new Date('2026-03-28T22:50:00'),
			}),
		).toThrow('Re-run with --force');
	});

	test('backs up existing feature config and prompt template and writes the latest templates when forced', () => {
		const sinyukHomePath = createTempDir();
		const configPath = getFeatureConfigPath('lora-dataset', sinyukHomePath);
		const promptTemplatePath = getPromptTemplatePath(sinyukHomePath);
		const oldConfig = `provider:
  baseUrl: https://api.openai.com/v1
  model: gpt-4.1-mini
  apiKeyEnv: OPENAI_API_KEY
  concurrency: 4
`;
		const oldPromptTemplate = 'Describe the subject in one line.\n';

		mkdirSync(join(sinyukHomePath, 'features', 'lora-dataset', 'prompts'), { recursive: true });
		writeFileSync(configPath, oldConfig, 'utf8');
		writeFileSync(promptTemplatePath, oldPromptTemplate, 'utf8');

		const result = resetLoraDatasetFeatureFiles({
			force: true,
			sinyukHomePath,
			now: new Date('2026-03-28T22:50:00'),
		});

		expect(result.files).toEqual([
			{
				path: configPath,
				backupPath: `${configPath}.bak-20260328-225000`,
			},
			{
				path: promptTemplatePath,
				backupPath: `${promptTemplatePath}.bak-20260328-225000`,
			},
		]);
		expect(existsSync(`${configPath}.bak-20260328-225000`)).toBe(true);
		expect(existsSync(`${promptTemplatePath}.bak-20260328-225000`)).toBe(true);
		expect(readFileSync(`${configPath}.bak-20260328-225000`, 'utf8')).toBe(oldConfig);
		expect(readFileSync(`${promptTemplatePath}.bak-20260328-225000`, 'utf8')).toBe(
			oldPromptTemplate,
		);
		expect(readFileSync(configPath, 'utf8')).toBe(readLoraDatasetTemplate('featureConfig'));
		expect(readFileSync(promptTemplatePath, 'utf8')).toBe(readLoraDatasetTemplate('userPrompt'));
	});
});

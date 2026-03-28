import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { resetLoraDatasetFeatureConfig } from '../../src/commands/config-reset-lora-dataset.js';
import { readLoraDatasetTemplate } from '../../src/features/lora-dataset/shared/templates.js';
import { getFeatureConfigPath } from '../../src/platform/home.js';

function createTempDir(): string {
	return mkdtempSync(join(tmpdir(), 'sinyuk-cli-reset-test-'));
}

describe('resetLoraDatasetFeatureConfig', () => {
	test('creates the latest template when config is missing', () => {
		const sinyukHomePath = createTempDir();

		const result = resetLoraDatasetFeatureConfig({
			force: false,
			sinyukHomePath,
			now: new Date('2026-03-28T22:50:00'),
		});

		expect(result.configPath).toBe(getFeatureConfigPath('lora-dataset', sinyukHomePath));
		expect(result.backupPath).toBeNull();
		expect(readFileSync(result.configPath, 'utf8')).toBe(readLoraDatasetTemplate('featureConfig'));
	});

	test('refuses to overwrite an existing config without force', () => {
		const sinyukHomePath = createTempDir();
		const configPath = getFeatureConfigPath('lora-dataset', sinyukHomePath);

		mkdirSync(join(sinyukHomePath, 'features', 'lora-dataset'), { recursive: true });
		writeFileSync(configPath, 'provider:\n  baseUrl: https://api.openai.com/v1\n', 'utf8');

		expect(() =>
			resetLoraDatasetFeatureConfig({
				force: false,
				sinyukHomePath,
				now: new Date('2026-03-28T22:50:00'),
			}),
		).toThrow('Re-run with --force');
	});

	test('backs up the existing config and writes the latest template when forced', () => {
		const sinyukHomePath = createTempDir();
		const configPath = getFeatureConfigPath('lora-dataset', sinyukHomePath);
		const oldConfig = `provider:
  baseUrl: https://api.openai.com/v1
  model: gpt-4.1-mini
  apiKeyEnv: OPENAI_API_KEY
  concurrency: 4
`;

		mkdirSync(join(sinyukHomePath, 'features', 'lora-dataset'), { recursive: true });
		writeFileSync(configPath, oldConfig, 'utf8');

		const result = resetLoraDatasetFeatureConfig({
			force: true,
			sinyukHomePath,
			now: new Date('2026-03-28T22:50:00'),
		});

		expect(result.backupPath).toBe(`${configPath}.bak-20260328-225000`);
		expect(existsSync(result.backupPath!)).toBe(true);
		expect(readFileSync(result.backupPath!, 'utf8')).toBe(oldConfig);
		expect(readFileSync(configPath, 'utf8')).toBe(readLoraDatasetTemplate('featureConfig'));
	});
});

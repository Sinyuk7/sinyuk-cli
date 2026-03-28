import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { loadResolvedConfig } from '../../src/platform/config/load-config.js';
import { ConfigError } from '../../src/platform/errors.js';

function createTempDir(): string {
	return mkdtempSync(join(tmpdir(), 'sinyuk-cli-test-'));
}

describe('loadResolvedConfig', () => {
	test('throws when global config is missing', () => {
		const cwd = createTempDir();
		const sinyukHomePath = join(cwd, '.sinyuk-cli');

		expect(() =>
			loadResolvedConfig({
				cwd,
				sinyukHomePath,
				globalConfigPath: join(sinyukHomePath, 'missing.yaml'),
				projectConfigPath: join(cwd, 'sinyuk.yaml'),
			}),
		).toThrow(ConfigError);
	});

	test('project config wins on conflict with atomic replacement', () => {
		const cwd = createTempDir();
		const sinyukHomePath = join(cwd, '.sinyuk-cli');
		const globalConfigPath = join(sinyukHomePath, 'config.yaml');
		const projectConfigPath = join(cwd, 'sinyuk.yaml');

		mkdirSync(sinyukHomePath, { recursive: true });
		writeFileSync(
			globalConfigPath,
			`features:
  hello-world:
    includeHidden: false
logging:
  level: info
`,
			'utf8',
		);
		writeFileSync(
			projectConfigPath,
			`features:
  hello-world:
    includeHidden: true
`,
			'utf8',
		);

		const loaded = loadResolvedConfig({
			cwd,
			sinyukHomePath,
			globalConfigPath,
			projectConfigPath,
		});

		expect(loaded.config.features?.['hello-world']).toEqual({ includeHidden: true });
		expect(loaded.config.logging?.level).toBe('info');
	});

	test('cli overrides have highest precedence', () => {
		const cwd = createTempDir();
		const sinyukHomePath = join(cwd, '.sinyuk-cli');
		const globalConfigPath = join(sinyukHomePath, 'config.yaml');
		const projectConfigPath = join(cwd, 'sinyuk.yaml');

		mkdirSync(sinyukHomePath, { recursive: true });
		writeFileSync(
			globalConfigPath,
			`logging:
  level: info
`,
			'utf8',
		);
		writeFileSync(
			projectConfigPath,
			`logging:
  level: warn
`,
			'utf8',
		);

		const loaded = loadResolvedConfig({
			cwd,
			sinyukHomePath,
			globalConfigPath,
			projectConfigPath,
			cliOverrides: {
				logging: {
					level: 'error',
				},
			},
		});

		expect(loaded.config.logging?.level).toBe('error');
	});

	test('feature home config loads independently per feature and project override replaces one feature atomically', () => {
		const cwd = createTempDir();
		const sinyukHomePath = join(cwd, '.sinyuk-cli');
		const globalConfigPath = join(sinyukHomePath, 'config.yaml');
		const projectConfigPath = join(cwd, 'sinyuk.yaml');

		mkdirSync(join(sinyukHomePath, 'features', 'hello-world'), { recursive: true });
		mkdirSync(join(sinyukHomePath, 'features', 'lora-dataset'), { recursive: true });
		writeFileSync(globalConfigPath, 'logging:\n  level: info\n', 'utf8');
		writeFileSync(
			join(sinyukHomePath, 'features', 'hello-world', 'config.yaml'),
			'includeHidden: false\n',
			'utf8',
		);
		writeFileSync(
			join(sinyukHomePath, 'features', 'lora-dataset', 'config.yaml'),
			`provider:
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
`,
			'utf8',
		);
		writeFileSync(
			projectConfigPath,
			`features:
  hello-world:
    includeHidden: true
`,
			'utf8',
		);

		const loaded = loadResolvedConfig({
			cwd,
			sinyukHomePath,
			globalConfigPath,
			projectConfigPath,
		});

		expect(loaded.featureConfigPaths).toHaveLength(2);
		expect(loaded.config.features?.['hello-world']).toEqual({ includeHidden: true });
		expect(loaded.config.features?.['lora-dataset']).toEqual({
			provider: {
				baseUrl: 'https://api.openai.com/v1',
				model: 'gpt-4.1-mini',
				apiKeyEnv: 'OPENAI_API_KEY',
				concurrency: 4,
				timeoutSeconds: 60,
				maxRetries: 2,
				analysisLongEdge: 1536,
				analysisJpegQuality: 90,
			},
			cropProfiles: [{ ratio: '1:1', longEdge: 1024 }],
		});
	});
});

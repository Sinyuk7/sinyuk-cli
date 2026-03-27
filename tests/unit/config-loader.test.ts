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

		expect(() =>
			loadResolvedConfig({
				cwd,
				globalConfigPath: join(cwd, 'missing.yaml'),
				projectConfigPath: join(cwd, 'sinyuk.yaml'),
			}),
		).toThrow(ConfigError);
	});

	test('project config wins on conflict with atomic replacement', () => {
		const cwd = createTempDir();
		const globalConfigPath = join(cwd, '.config', 'sinyuk', 'config.yaml');
		const projectConfigPath = join(cwd, 'sinyuk.yaml');

		mkdirSync(join(cwd, '.config', 'sinyuk'), { recursive: true });
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
			globalConfigPath,
			projectConfigPath,
		});

		expect(loaded.config.features?.['hello-world']).toEqual({ includeHidden: true });
		expect(loaded.config.logging?.level).toBe('info');
	});

	test('cli overrides have highest precedence', () => {
		const cwd = createTempDir();
		const globalConfigPath = join(cwd, '.config', 'sinyuk', 'config.yaml');
		const projectConfigPath = join(cwd, 'sinyuk.yaml');

		mkdirSync(join(cwd, '.config', 'sinyuk'), { recursive: true });
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
});

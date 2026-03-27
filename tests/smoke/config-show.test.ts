import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';
import { describe, expect, test } from 'vitest';

function createTempHome(): string {
	return mkdtempSync(join(tmpdir(), 'sinyuk-cli-home-'));
}

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(currentFile), '..', '..');
const distEntrypoint = join(repoRoot, 'dist', 'index.js');

describe('config show smoke', () => {
	test('prints sources and merged config', async () => {
		const home = createTempHome();
		const cwd = mkdtempSync(join(tmpdir(), 'sinyuk-cli-cwd-'));
		const globalConfigPath = join(home, '.config', 'sinyuk', 'config.yaml');

		mkdirSync(join(home, '.config', 'sinyuk'), { recursive: true });
		writeFileSync(
			globalConfigPath,
			`logging:
  level: info
features:
  hello-world:
    includeHidden: false
`,
			'utf8',
		);
		writeFileSync(
			join(cwd, 'sinyuk.yaml'),
			`features:
  hello-world:
    includeHidden: true
`,
			'utf8',
		);

		const result = await execa('node', [distEntrypoint, 'config', 'show'], {
			cwd,
			env: {
				...process.env,
				HOME: home,
			},
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Config Sources');
		expect(result.stdout).toContain('Resolved Config (YAML)');
		expect(result.stdout).toContain('includeHidden: true');
	});
});

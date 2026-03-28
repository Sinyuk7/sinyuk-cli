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
		const globalConfigPath = join(home, '.sinyuk-cli', 'config.yaml');

		mkdirSync(join(home, '.sinyuk-cli', 'features', 'hello-world'), { recursive: true });
		writeFileSync(
			globalConfigPath,
			`logging:
  level: info
`,
			'utf8',
		);
		writeFileSync(
			join(home, '.sinyuk-cli', 'features', 'hello-world', 'config.yaml'),
			`includeHidden: false
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
				USERPROFILE: home,
			},
		});

		expect(result.exitCode).toBe(0);
		const normalizedStdout = result.stdout.replaceAll('\\', '/');
		expect(result.stdout).toContain('Config Sources');
		expect(result.stdout).toContain('Sinyuk Home');
		expect(normalizedStdout).toContain('.sinyuk-cli/features/hello-world/config.yaml');
		expect(result.stdout).toContain('Resolved Config (YAML)');
		expect(result.stdout).toContain('includeHidden: true');
	});
});

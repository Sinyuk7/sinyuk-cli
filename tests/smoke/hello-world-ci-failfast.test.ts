import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';
import { describe, expect, test } from 'vitest';

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(currentFile), '..', '..');
const distEntrypoint = join(repoRoot, 'dist', 'index.js');

function createTempHome(): string {
	return mkdtempSync(join(tmpdir(), 'sinyuk-ci-home-'));
}

describe('hello-world ci fail-fast smoke', () => {
	test('fails fast when required args are missing in CI mode', async () => {
		const home = createTempHome();

		mkdirSync(join(home, '.config', 'sinyuk'), { recursive: true });
		writeFileSync(
			join(home, '.config', 'sinyuk', 'config.yaml'),
			`features:
  hello-world:
    includeHidden: false
`,
			'utf8',
		);

		const result = await execa('node', [distEntrypoint, 'hello-world', 'run'], {
			env: {
				...process.env,
				HOME: home,
				CI: '1',
			},
			reject: false,
		});

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain('Missing required inputs');
	});
});

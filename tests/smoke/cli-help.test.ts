import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { execa } from 'execa';
import { describe, expect, test } from 'vitest';

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(currentFile), '..', '..');

describe('CLI smoke', () => {
	test('sinyuk-cli --help prints usage', async () => {
		const result = await execa('node', ['dist/index.js', '--help'], {
			cwd: repoRoot,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('sinyuk-cli');
	});
});

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
	readRememberedLoraDatasetPath,
	rememberLoraDatasetPath,
} from '../shared/last-path.js';

function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

const originalSinyukHome = process.env.SINYUK_HOME;

function restoreSinyukHome(): void {
	if (originalSinyukHome === undefined) {
		delete process.env.SINYUK_HOME;
		return;
	}

	process.env.SINYUK_HOME = originalSinyukHome;
}

describe('lora-dataset last path memory', () => {
	afterEach(() => restoreSinyukHome());

	test('returns null when no remembered path exists', () => {
		process.env.SINYUK_HOME = createTempDir('sinyuk-home-');

		expect(readRememberedLoraDatasetPath()).toBeNull();
	});

	test('persists and restores the remembered dataset path', () => {
		process.env.SINYUK_HOME = createTempDir('sinyuk-home-');

		rememberLoraDatasetPath('/tmp/my-dataset');

		expect(readRememberedLoraDatasetPath()).toBe(resolve('/tmp/my-dataset'));
	});

	test('normalizes relative stored paths to absolute paths', () => {
		const homePath = createTempDir('sinyuk-home-');
		process.env.SINYUK_HOME = homePath;

		const filePath = join(homePath, 'features', 'lora-dataset', 'last-dataset-path.txt');
		mkdirSync(join(homePath, 'features', 'lora-dataset'), { recursive: true });
		writeFileSync(filePath, './relative-dataset\n', 'utf8');

		expect(readRememberedLoraDatasetPath()).toBe(resolve('./relative-dataset'));
	});
});

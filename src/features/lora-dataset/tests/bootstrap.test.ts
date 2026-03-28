import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	LoraDatasetBootstrapPauseError,
	ensureLoraDatasetPromptReady,
} from '../shared/bootstrap.js';
import { resolveLoraDatasetWorkspace } from '../shared/workspace.js';

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

async function writePromptTemplate(homePath: string, content: string): Promise<void> {
	const templatePath = join(
		homePath,
		'features',
		'lora-dataset',
		'prompts',
		'user-prompt.txt.example',
	);
	mkdirSync(dirname(templatePath), { recursive: true });
	writeFileSync(templatePath, content, 'utf8');
}

describe('ensureLoraDatasetPromptReady', () => {
	afterEach(() => restoreSinyukHome());

	test('copies the prompt template into the dataset workspace and pauses on first run', async () => {
		const homePath = createTempDir('sinyuk-home-');
		const datasetPath = createTempDir('sinyuk-dataset-');
		process.env.SINYUK_HOME = homePath;
		await writePromptTemplate(homePath, 'template prompt\n');

		await expect(ensureLoraDatasetPromptReady(datasetPath)).rejects.toBeInstanceOf(
			LoraDatasetBootstrapPauseError,
		);

		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		await expect(readFile(workspace.promptPath, 'utf8')).resolves.toBe('template prompt\n');
	});

	test('pauses when the dataset-local prompt still matches the template', async () => {
		const homePath = createTempDir('sinyuk-home-');
		const datasetPath = createTempDir('sinyuk-dataset-');
		process.env.SINYUK_HOME = homePath;
		await writePromptTemplate(homePath, 'template prompt\n');

		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		mkdirSync(workspace.workDirPath, { recursive: true });
		writeFileSync(workspace.promptPath, 'template prompt\r\n', 'utf8');

		await expect(ensureLoraDatasetPromptReady(datasetPath)).rejects.toBeInstanceOf(
			LoraDatasetBootstrapPauseError,
		);
	});

	test('returns the dataset workspace after the prompt has been customized', async () => {
		const homePath = createTempDir('sinyuk-home-');
		const datasetPath = createTempDir('sinyuk-dataset-');
		process.env.SINYUK_HOME = homePath;
		await writePromptTemplate(homePath, 'template prompt\n');

		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		mkdirSync(workspace.workDirPath, { recursive: true });
		writeFileSync(workspace.promptPath, 'customized prompt\nwith trigger words\n', 'utf8');

		await expect(ensureLoraDatasetPromptReady(datasetPath)).resolves.toEqual(workspace);
	});
});

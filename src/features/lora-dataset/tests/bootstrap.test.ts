import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	LoraDatasetBootstrapPauseError,
	ensureLoraDatasetPromptReady,
} from '../shared/bootstrap.js';
import { readLoraDatasetTemplate } from '../shared/templates.js';
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
		const bundledPromptTemplate = readLoraDatasetTemplate('userPrompt');
		await writePromptTemplate(homePath, bundledPromptTemplate);

		await expect(ensureLoraDatasetPromptReady(datasetPath)).rejects.toBeInstanceOf(
			LoraDatasetBootstrapPauseError,
		);

		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		await expect(readFile(workspace.promptPath, 'utf8')).resolves.toBe(bundledPromptTemplate);
		await expect(readFile(workspace.configPath, 'utf8')).resolves.toContain('request:');
	});

	test('pauses when the dataset-local prompt still matches the template', async () => {
		const homePath = createTempDir('sinyuk-home-');
		const datasetPath = createTempDir('sinyuk-dataset-');
		process.env.SINYUK_HOME = homePath;
		const bundledPromptTemplate = readLoraDatasetTemplate('userPrompt');
		await writePromptTemplate(homePath, bundledPromptTemplate);

		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		mkdirSync(workspace.workDirPath, { recursive: true });
		writeFileSync(
			workspace.configPath,
			'request:\n  temperature: 0.2\n  topP: 0.9\n  maxOutputTokens: 256\ncaptionAssembly:\n  separator: ". "\n  keepSubjectFirst: true\n',
			'utf8',
		);
		writeFileSync(
			workspace.promptPath,
			bundledPromptTemplate.replace(/\n/g, '\r\n'),
			'utf8',
		);

		await expect(ensureLoraDatasetPromptReady(datasetPath)).rejects.toBeInstanceOf(
			LoraDatasetBootstrapPauseError,
		);
	});

	test('continues immediately after copying a customized feature-home prompt template on first run', async () => {
		const homePath = createTempDir('sinyuk-home-');
		const datasetPath = createTempDir('sinyuk-dataset-');
		process.env.SINYUK_HOME = homePath;
		await writePromptTemplate(
			homePath,
			'Use trigger words: silver hair, maid outfit, indoor portrait.\nReturn strict JSON only.\n',
		);

		const workspace = resolveLoraDatasetWorkspace(datasetPath);

		await expect(ensureLoraDatasetPromptReady(datasetPath)).resolves.toEqual(workspace);
		await expect(readFile(workspace.promptPath, 'utf8')).resolves.toBe(
			'Use trigger words: silver hair, maid outfit, indoor portrait.\nReturn strict JSON only.\n',
		);
	});

	test('accepts dataset-local prompt that matches a customized feature-home prompt template', async () => {
		const homePath = createTempDir('sinyuk-home-');
		const datasetPath = createTempDir('sinyuk-dataset-');
		process.env.SINYUK_HOME = homePath;
		await writePromptTemplate(
			homePath,
			'Use trigger words: silver hair, maid outfit, indoor portrait.\nReturn strict JSON only.\n',
		);

		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		mkdirSync(workspace.workDirPath, { recursive: true });
		writeFileSync(
			workspace.configPath,
			'request:\n  temperature: 0.2\n  topP: 0.9\n  maxOutputTokens: 256\ncaptionAssembly:\n  separator: ". "\n  keepSubjectFirst: true\n',
			'utf8',
		);
		writeFileSync(
			workspace.promptPath,
			'Use trigger words: silver hair, maid outfit, indoor portrait.\nReturn strict JSON only.\n',
			'utf8',
		);

		await expect(ensureLoraDatasetPromptReady(datasetPath)).resolves.toEqual(workspace);
	});

	test('returns the dataset workspace after the prompt has been customized', async () => {
		const homePath = createTempDir('sinyuk-home-');
		const datasetPath = createTempDir('sinyuk-dataset-');
		process.env.SINYUK_HOME = homePath;
		await writePromptTemplate(homePath, 'template prompt\n');

		const workspace = resolveLoraDatasetWorkspace(datasetPath);
		mkdirSync(workspace.workDirPath, { recursive: true });
		writeFileSync(
			workspace.configPath,
			'request:\n  temperature: 0.2\n  topP: 0.9\n  maxOutputTokens: 256\ncaptionAssembly:\n  separator: ". "\n  keepSubjectFirst: true\n',
			'utf8',
		);
		writeFileSync(workspace.promptPath, 'customized prompt\nwith trigger words\n', 'utf8');

		await expect(ensureLoraDatasetPromptReady(datasetPath)).resolves.toEqual(workspace);
	});
});

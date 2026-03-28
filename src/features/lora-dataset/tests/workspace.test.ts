/**
 * Tests for workspace resolution, config validation, and prompt loading.
 *
 * INTENT: Verify path conventions, config schema enforcement, and prompt file I/O
 * INPUT: In-memory config objects, temp filesystem
 * OUTPUT: Validated workspace paths, config parsing, prompt text
 * SIDE EFFECT: Temp filesystem writes
 * FAILURE: Fail fast on schema violations or missing files
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadUserPrompt, readApiKey } from '../shared/provider.js';
import {
	getLoraDatasetFeatureConfig,
	loadLoraDatasetDatasetConfig,
} from '../shared/schema.js';
import { resolveLoraDatasetWorkspace } from '../shared/workspace.js';
import {
	DATASET_CONFIG,
	PLATFORM_CONFIG,
	PROVIDER_CONFIG,
	createTempDir,
	withTempSinyukHome,
} from './_test-helpers.js';

// ---------------------------------------------------------------------------
// Workspace path resolution
// ---------------------------------------------------------------------------

describe('workspace resolution', () => {
	const env = withTempSinyukHome();
	beforeEach(() => env.getHomePath());
	afterEach(() => env.restore());

	test('resolves all standard workspace paths', () => {
		const workspace = resolveLoraDatasetWorkspace('/test/dataset');
		expect(workspace.datasetPath).toBe(resolve('/test/dataset'));
		expect(workspace.workDirPath).toMatch(/_lora_dataset$/);
		expect(workspace.configPath).toContain('config.yaml');
		expect(workspace.promptPath).toContain('user-prompt.txt');
		expect(workspace.runSummaryPath).toContain('run-summary.json');
		expect(workspace.failedItemsPath).toContain('failed-items.txt');
		expect(workspace.rawDirPath).toContain('raw');
	});
});

// ---------------------------------------------------------------------------
// Config validation (getLoraDatasetFeatureConfig)
// ---------------------------------------------------------------------------

describe('getLoraDatasetFeatureConfig', () => {
	test('validates correct config snapshot', () => {
		const config = getLoraDatasetFeatureConfig(PLATFORM_CONFIG);
		expect(config.provider.baseUrl).toBe('https://hk.n1n.ai/v1');
		expect(config.provider.model).toBe('qwen3.5-122b-a10b');
		expect(config.scheduler.concurrency).toBe(2);
		expect(config.crop.ratioOptions).toEqual(['1:1', '3:4', '4:3']);
		expect(config.crop.resolutionOptions).toEqual([512, 768, 1024]);
	});

	test('throws on missing feature section', () => {
		expect(() => getLoraDatasetFeatureConfig({})).toThrow('Invalid feature config');
	});

	test('throws on invalid provider fields', () => {
		expect(() =>
			getLoraDatasetFeatureConfig({
				features: {
					'lora-dataset': { provider: { baseUrl: 'not-a-url' }, crop: { ratioOptions: [], resolutionOptions: [] } },
				},
			}),
		).toThrow('Invalid feature config');
	});

	test('throws on legacy cropProfiles config', () => {
		expect(() =>
			getLoraDatasetFeatureConfig({
				features: {
					'lora-dataset': {
						provider: PROVIDER_CONFIG,
						scheduler: {
							concurrency: 2,
							timeoutSeconds: 120,
							maxRetries: 1,
							retryBaseDelayMs: 50,
							retryMaxDelayMs: 100,
							circuitBreakerFailureThreshold: 3,
						},
						analysis: {
							longEdge: 1024,
							jpegQuality: 85,
						},
						cropProfiles: [{ ratio: '1:1', longEdge: 512 }],
					},
				},
			} as never),
		).toThrow('Invalid feature config');
	});
});

describe('loadLoraDatasetDatasetConfig', () => {
	test('loads strict dataset config without fallback injection', () => {
		const configPath = join(createTempDir('dataset-config-'), 'config.yaml');
		writeFileSync(
			configPath,
			`request:
  temperature: ${DATASET_CONFIG.request.temperature}
  topP: ${DATASET_CONFIG.request.topP}
  maxOutputTokens: ${DATASET_CONFIG.request.maxOutputTokens}
captionAssembly:
  separator: "${DATASET_CONFIG.captionAssembly.separator}"
  keepSubjectFirst: ${DATASET_CONFIG.captionAssembly.keepSubjectFirst}
`,
			'utf8',
		);

		expect(loadLoraDatasetDatasetConfig(configPath)).toEqual(DATASET_CONFIG);
	});

	test('throws on unknown dataset config fields', () => {
		const configPath = join(createTempDir('dataset-config-'), 'config.yaml');
		writeFileSync(
			configPath,
			'request:\n  temperature: 0.2\n  topP: 0.9\n  maxOutputTokens: 256\n  temp: 123\ncaptionAssembly:\n  separator: ". "\n  keepSubjectFirst: true\n',
			'utf8',
		);

		expect(() => loadLoraDatasetDatasetConfig(configPath)).toThrow('Invalid dataset config');
	});
});

// ---------------------------------------------------------------------------
// readApiKey contract
// ---------------------------------------------------------------------------

describe('readApiKey', () => {
	test('reads API key from env snapshot', () => {
		const key = readApiKey(PROVIDER_CONFIG, { TEST_LORA_API_KEY: 'test-key-123' });
		expect(key).toBe('test-key-123');
	});

	test('throws when env variable is missing', () => {
		expect(() => readApiKey(PROVIDER_CONFIG, {})).toThrow('Missing required environment variable');
	});

	test('throws when env variable is whitespace-only', () => {
		expect(() => readApiKey(PROVIDER_CONFIG, { TEST_LORA_API_KEY: '  ' })).toThrow(
			'Missing required environment variable',
		);
	});
});

// ---------------------------------------------------------------------------
// loadUserPrompt
// ---------------------------------------------------------------------------

describe('loadUserPrompt', () => {
	test('loads and trims prompt text', async () => {
		const tmpFile = join(createTempDir('prompt-'), 'prompt.txt');
		writeFileSync(tmpFile, '  hello world  \n\n', 'utf8');
		expect(await loadUserPrompt(tmpFile)).toBe('hello world');
	});

	test('throws on empty prompt file', async () => {
		const tmpFile = join(createTempDir('prompt-'), 'prompt.txt');
		writeFileSync(tmpFile, '   \n\n', 'utf8');
		await expect(loadUserPrompt(tmpFile)).rejects.toThrow('empty');
	});

	test('throws on nonexistent prompt file', async () => {
		await expect(loadUserPrompt('/nonexistent/path/prompt.txt')).rejects.toThrow();
	});
});

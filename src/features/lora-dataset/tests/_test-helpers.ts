/**
 * Shared test fixtures, constants, and helpers for lora-dataset feature tests.
 *
 * INTENT: Provide one source of truth for test config, temp dir management, and workspace setup
 * INPUT: none
 * OUTPUT: Exported constants, helper functions
 * SIDE EFFECT: Creates temp dirs and writes fixture files when helpers are called
 * FAILURE: Propagate filesystem errors from Node.js
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import type {
	LoraDatasetDatasetConfig,
	LoraDatasetFeatureConfig,
} from '../shared/schema.js';
import { resolveLoraDatasetWorkspace } from '../shared/workspace.js';
import type { PlatformConfig } from '../../../platform/config/schema.js';
import type { ExecutionContext } from '../../../platform/execution-context.js';
import type { RunLogger } from '../../../platform/logging/logger.js';

// ---------------------------------------------------------------------------
// Test data paths
// ---------------------------------------------------------------------------

export const LOCAL_DATA_DIR = resolve(__dirname, '.local-data');
export const LOCAL_RUNS_DIR = join(LOCAL_DATA_DIR, '.runs');
export const TEST_1_DIR = join(LOCAL_DATA_DIR, 'test-1-image-1');
export const TEST_2_DIR = join(LOCAL_DATA_DIR, 'test-2-image-5');

// ---------------------------------------------------------------------------
// API key - always from env, never hardcoded
// ---------------------------------------------------------------------------

export const API_KEY = process.env.TEST_LORA_API_KEY ?? '';
export const HAS_API_KEY = API_KEY.length > 0;

// ---------------------------------------------------------------------------
// Feature config fixtures
// ---------------------------------------------------------------------------

export const PROVIDER_CONFIG: LoraDatasetFeatureConfig['provider'] = {
	baseUrl: 'https://hk.n1n.ai/v1',
	fallbackBaseUrl: 'https://api.n1n.ai/v1',
	model: 'qwen3.5-122b-a10b',
	apiKeyEnv: 'TEST_LORA_API_KEY',
};

export const FEATURE_CONFIG: LoraDatasetFeatureConfig = {
	provider: PROVIDER_CONFIG,
	scheduler: {
		concurrency: 2,
		timeoutSeconds: 120,
		maxRetries: 1,
		retryBaseDelayMs: 50,
		retryMaxDelayMs: 100,
	},
	analysis: {
		longEdge: 1024,
		jpegQuality: 85,
	},
	crop: {
		ratioOptions: ['1:1', '3:4', '4:3'],
		resolutionOptions: [512, 768, 1024],
	},
};

export const DATASET_CONFIG: LoraDatasetDatasetConfig = {
	request: {
		temperature: 0.2,
		topP: 0.9,
		maxOutputTokens: 256,
	},
	captionAssembly: {
		separator: '. ',
		outputFields: [
			'subject',
			'action',
			'clothing',
			'appearance',
			'props',
			'scene',
			'view',
			'lighting',
			'style',
			'background',
			'details',
		],
	},
};

export const PLATFORM_CONFIG: PlatformConfig = {
	features: { 'lora-dataset': FEATURE_CONFIG },
};

export const TEST_PROMPT = `Return strict JSON only. No markdown fences.

Describe the image for LoRA training:
{
  "subject": "short description of main subject",
  "appearance": "visual details",
  "background": "background description",
  "style": "art style or photo type"
}`;

export const TEMPLATE_PROMPT = `Return strict JSON only.

Describe the main subject first, then short visual details useful for LoRA training.
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

/**
"""Create one visible dataset runtime directory under the feature-local test data area.

INTENT: Keep generated caption/crop artifacts inside the repo test directory so runs are inspectable after Vitest completes
INPUT: sourceDir
OUTPUT: absolute runtime dataset directory path
SIDE EFFECT: Creates tests/.local-data/.runs and one unique child directory
FAILURE: Propagate filesystem errors from Node.js
"""
 */
function createLocalDatasetRunDir(sourceDir: string): string {
	mkdirSync(LOCAL_RUNS_DIR, { recursive: true });
	return mkdtempSync(join(LOCAL_RUNS_DIR, `${basename(sourceDir)}-run-`));
}

export function createNoopLogger(): RunLogger {
	return {
		debug() {},
		info() {},
		warn() {},
		error() {},
	};
}

export function createTestExecutionContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
	return {
		runId: 'test-run-id',
		entryMode: 'cli',
		configSnapshot: PLATFORM_CONFIG,
		envSnapshot: { TEST_LORA_API_KEY: API_KEY },
		logger: createNoopLogger(),
		abortSignal: AbortSignal.timeout(120_000),
		dryRun: false,
		isTTY: false,
		...overrides,
	};
}

function createDatasetConfigYaml(): string {
	return `request:
  temperature: ${DATASET_CONFIG.request.temperature}
  topP: ${DATASET_CONFIG.request.topP}
  maxOutputTokens: ${DATASET_CONFIG.request.maxOutputTokens}
captionAssembly:
  separator: "${DATASET_CONFIG.captionAssembly.separator}"
  outputFields:
${DATASET_CONFIG.captionAssembly.outputFields.map((field) => `    - ${field}`).join('\n')}
`;
}

/**
 * Copy a source test-data directory into a feature-local runtime dir and prepare workspace with prompt.
 *
 * INTENT: Isolate each test run while keeping generated artifacts visible under tests/.local-data/.runs
 */
export function setupDatasetWorkspace(
	sourceDir: string,
	homePath: string,
): { datasetPath: string; homePath: string } {
	const { cpSync } = require('node:fs') as typeof import('node:fs');
	const datasetPath = createLocalDatasetRunDir(sourceDir);
	cpSync(sourceDir, datasetPath, { recursive: true });

	const templatePath = join(homePath, 'features', 'lora-dataset', 'prompts', 'user-prompt.txt.example');
	mkdirSync(dirname(templatePath), { recursive: true });
	writeFileSync(templatePath, TEMPLATE_PROMPT, 'utf8');

	const workspace = resolveLoraDatasetWorkspace(datasetPath);
	mkdirSync(workspace.workDirPath, { recursive: true });
	writeFileSync(workspace.configPath, createDatasetConfigYaml(), 'utf8');
	writeFileSync(workspace.promptPath, TEST_PROMPT, 'utf8');

	return { datasetPath, homePath };
}

// ---------------------------------------------------------------------------
// SINYUK_HOME env guard - use in beforeEach/afterEach
// ---------------------------------------------------------------------------

const originalSinyukHome = process.env.SINYUK_HOME;

export function withTempSinyukHome(): { getHomePath: () => string; restore: () => void } {
	let homePath = '';

	return {
		getHomePath() {
			if (!homePath) {
				homePath = createTempDir('e2e-home-');
				process.env.SINYUK_HOME = homePath;
			}
			return homePath;
		},
		restore() {
			if (originalSinyukHome === undefined) {
				delete process.env.SINYUK_HOME;
			} else {
				process.env.SINYUK_HOME = originalSinyukHome;
			}
			homePath = '';
		},
	};
}

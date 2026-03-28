import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { parse } from 'yaml';

import { ConfigError } from '../errors.js';
import { getFeatureConfigPath, getGlobalConfigPath, getSinyukHomePath } from '../home.js';
import { LoadedConfig, PlatformConfig, PlatformConfigSchema } from './schema.js';

export type LoadConfigOptions = {
	cwd: string;
	sinyukHomePath?: string;
	globalConfigPath?: string;
	projectConfigPath?: string;
	cliOverrides?: Partial<PlatformConfig>;
};

function getProjectConfigPath(cwd: string): string {
	return join(cwd, 'sinyuk.yaml');
}

function parseYamlFile(filePath: string): unknown {
	try {
		const content = readFileSync(filePath, 'utf8');
		return parse(content);
	} catch (error) {
		throw new ConfigError(
			`Failed to parse YAML at ${filePath}: ${(error as Error).message}`,
			error,
		);
	}
}

function validateConfig(config: unknown, filePath: string): PlatformConfig {
	const parsed = PlatformConfigSchema.safeParse(config);

	if (!parsed.success) {
		throw new ConfigError(
			`[Config Error] Invalid config at ${filePath}: ${parsed.error.issues
				.map((issue) => `${issue.path.join('.') || 'root'} ${issue.message}`)
				.join('; ')}`,
		);
	}

	return parsed.data;
}

function mergeAtomic(base: PlatformConfig, override?: Partial<PlatformConfig>): PlatformConfig {
	if (!override) {
		return { ...base };
	}

	return {
		...base,
		...override,
		features: {
			...(base.features ?? {}),
			...(override.features ?? {}),
		},
	};
}

/**
"""List every existing feature-scoped config file under SINYUK_HOME.

INTENT: Discover independently owned feature config files without hard-coding feature ids
INPUT: optional sinyukHomePath override
OUTPUT: absolute config.yaml paths for every feature directory that contains one
SIDE EFFECT: Read the feature home directory entries from disk
FAILURE: Propagate filesystem errors from directory reads
"""
 */
function listFeatureConfigPaths(sinyukHomePath?: string): string[] {
	const featuresRoot = join(getSinyukHomePath(sinyukHomePath), 'features');
	if (!existsSync(featuresRoot)) {
		return [];
	}

	return readdirSync(featuresRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => getFeatureConfigPath(entry.name, sinyukHomePath))
		.filter((configPath) => existsSync(configPath));
}

/**
"""Read raw feature config documents from every feature home directory.

INTENT: Build a feature-id keyed snapshot before platform-level validation and merging
INPUT: optional sinyukHomePath override
OUTPUT: record of feature id to parsed YAML document
SIDE EFFECT: Read feature config files from disk
FAILURE: Throw ConfigError when any feature config YAML cannot be parsed
"""
 */
function readFeatureHomeConfigs(sinyukHomePath?: string): Record<string, unknown> {
	const featureConfigs = listFeatureConfigPaths(sinyukHomePath).map((configPath) => ({
		featureId: basename(dirname(configPath)),
		config: parseYamlFile(configPath),
	}));

	return Object.fromEntries(featureConfigs.map((entry) => [entry.featureId, entry.config]));
}

/**
"""Wrap feature home configs into the platform config envelope.

INTENT: Reuse the same platform schema and merge path for feature-home config files
INPUT: optional sinyukHomePath override
OUTPUT: PlatformConfig containing only the features snapshot
SIDE EFFECT: Read feature config files from disk
FAILURE: Throw ConfigError when the wrapped feature snapshot violates the platform schema
"""
 */
function buildFeatureHomeConfigSnapshot(sinyukHomePath?: string): PlatformConfig {
	const featureConfigs = readFeatureHomeConfigs(sinyukHomePath);
	if (Object.keys(featureConfigs).length === 0) {
		return {};
	}

	return validateConfig({ features: featureConfigs }, '<SINYUK_HOME>/features');
}

/**
"""Resolve the final config snapshot from platform, feature-home, project, and CLI layers.

INTENT: Enforce one explicit load order while keeping each feature's config boundary independent
INPUT: LoadConfigOptions
OUTPUT: LoadedConfig
SIDE EFFECT: Read YAML config files from SINYUK_HOME and the current workspace
FAILURE: Throw ConfigError when required files are missing, YAML is invalid, or schema validation fails
"""
 */
export function loadResolvedConfig(options: LoadConfigOptions): LoadedConfig {
	const sinyukHomePath = getSinyukHomePath(options.sinyukHomePath);
	const globalPath = options.globalConfigPath ?? getGlobalConfigPath(sinyukHomePath);
	const projectPath = options.projectConfigPath ?? getProjectConfigPath(options.cwd);

	if (!existsSync(globalPath)) {
		throw new ConfigError(
			`Missing global config at ${globalPath}. Run "sinyuk-cli init" to create it.`,
		);
	}

	const globalConfig = validateConfig(parseYamlFile(globalPath), globalPath);
	const featureConfigPaths = listFeatureConfigPaths(sinyukHomePath);
	const featureHomeConfig = buildFeatureHomeConfigSnapshot(sinyukHomePath);

	const projectLoaded = existsSync(projectPath);
	const projectConfig = projectLoaded
		? validateConfig(parseYamlFile(projectPath), projectPath)
		: undefined;

	const merged = mergeAtomic(
		mergeAtomic(mergeAtomic(globalConfig, featureHomeConfig), projectConfig),
		options.cliOverrides,
	);

	return {
		sinyukHomePath,
		globalPath,
		projectPath,
		projectLoaded,
		featureConfigPaths,
		config: Object.freeze(merged),
	};
}

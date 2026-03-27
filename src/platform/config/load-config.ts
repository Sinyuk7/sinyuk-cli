import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parse } from 'yaml';

import { ConfigError } from '../errors.js';
import { LoadedConfig, PlatformConfig, PlatformConfigSchema } from './schema.js';

type LoadConfigOptions = {
	cwd: string;
	globalConfigPath?: string;
	projectConfigPath?: string;
	cliOverrides?: Partial<PlatformConfig>;
};

function getGlobalConfigPath(): string {
	return join(homedir(), '.config', 'sinyuk', 'config.yaml');
}

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

	return { ...base, ...override };
}

/**
"""Resolve config from global/project/CLI layers with simple atomic precedence.

INTENT: 按 CLI > project > global > defaults(空对象) 的顺序加载并合并配置
INPUT: LoadConfigOptions
OUTPUT: LoadedConfig
SIDE EFFECT: 读取文件系统中的 YAML 配置文件
FAILURE: 缺失全局配置、YAML 解析失败、Zod 校验失败时抛出 ConfigError
"""
 */
export function loadResolvedConfig(options: LoadConfigOptions): LoadedConfig {
	const globalPath = options.globalConfigPath ?? getGlobalConfigPath();
	const projectPath = options.projectConfigPath ?? getProjectConfigPath(options.cwd);

	if (!existsSync(globalPath)) {
		throw new ConfigError(
			`Missing global config at ${globalPath}. Run "sinyuk-cli init" to create it.`,
		);
	}

	const globalConfig = validateConfig(parseYamlFile(globalPath), globalPath);

	const projectLoaded = existsSync(projectPath);
	const projectConfig = projectLoaded
		? validateConfig(parseYamlFile(projectPath), projectPath)
		: undefined;

	const merged = mergeAtomic(mergeAtomic(globalConfig, projectConfig), options.cliOverrides);

	return {
		globalPath,
		projectPath,
		projectLoaded,
		config: Object.freeze(merged),
	};
}

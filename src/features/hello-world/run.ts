import { access, constants, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { ExecutionContext } from '../../platform/execution-context.js';
import type { HelloWorldFeatureConfig } from './schema.js';

export type HelloWorldScanResult = {
	basePath: string;
	files: string[];
};

export type HelloWorldRunInput = {
	basePath: string;
	selectedFiles: string[];
};

export type HelloWorldRunResult = {
	processed: string[];
	failed: Array<{ file: string; reason: string }>;
	dryRun: boolean;
};

function ensureNotAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new Error('Operation cancelled.');
	}
}

async function scanDirectoryRecursive(options: {
	basePath: string;
	currentPath: string;
	includeHidden: boolean;
	signal: AbortSignal;
	output: string[];
}): Promise<void> {
	ensureNotAborted(options.signal);

	const entries = await readdir(options.currentPath, { withFileTypes: true });

	for (const entry of entries) {
		ensureNotAborted(options.signal);

		if (!options.includeHidden && entry.name.startsWith('.')) {
			continue;
		}

		const absolutePath = join(options.currentPath, entry.name);

		if (entry.isDirectory()) {
			await scanDirectoryRecursive({
				...options,
				currentPath: absolutePath,
			});
			continue;
		}

		if (entry.isFile()) {
			options.output.push(relative(options.basePath, absolutePath));
		}
	}
}

/**
"""Scan target path and return relative file list for selection UI.

INTENT: 扫描目录并产出可选择文件列表，供交互态和自动态共用
INPUT: basePath, featureConfig, abortSignal
OUTPUT: HelloWorldScanResult
SIDE EFFECT: 读取文件系统目录结构
FAILURE: 路径不存在、非目录、权限不足或取消执行时抛出 Error
"""
 */
export async function scanHelloWorldFiles(options: {
	basePath: string;
	featureConfig: HelloWorldFeatureConfig;
	abortSignal: AbortSignal;
}): Promise<HelloWorldScanResult> {
	const absoluteBasePath = resolve(options.basePath);
	const meta = await stat(absoluteBasePath);

	if (!meta.isDirectory()) {
		throw new Error(`Path is not a directory: ${absoluteBasePath}`);
	}

	const files: string[] = [];
	await scanDirectoryRecursive({
		basePath: absoluteBasePath,
		currentPath: absoluteBasePath,
		includeHidden: options.featureConfig.includeHidden ?? false,
		signal: options.abortSignal,
		output: files,
	});

	return {
		basePath: absoluteBasePath,
		files: files.sort((left, right) => left.localeCompare(right)),
	};
}

async function processOneFile(
	input: HelloWorldRunInput,
	file: string,
	context: ExecutionContext,
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const absoluteFilePath = join(input.basePath, file);

	try {
		await access(absoluteFilePath, constants.R_OK);
		await sleep(50, undefined, { signal: context.abortSignal });
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: (error as Error).message };
	}
}

/**
"""Execute hello-world pipeline for selected files with progress callback.

INTENT: 执行统一 pipeline（dry-run 与真实执行共用路径）并返回结果摘要
INPUT: HelloWorldRunInput, ExecutionContext, onProgress callback
OUTPUT: HelloWorldRunResult
SIDE EFFECT: 写入 run-scoped 结构化日志
FAILURE: 选中文件为空或执行被取消时抛出 Error
"""
 */
export async function runHelloWorldPipeline(
	input: HelloWorldRunInput,
	context: ExecutionContext,
	onProgress?: (progress: { current: number; total: number; file: string }) => void,
): Promise<HelloWorldRunResult> {
	if (input.selectedFiles.length === 0) {
		throw new Error('No files selected.');
	}

	context.logger.info('hello-world:start', {
		basePath: input.basePath,
		selectedCount: input.selectedFiles.length,
		dryRun: context.dryRun,
	});

	const processed: string[] = [];
	const failed: Array<{ file: string; reason: string }> = [];

	for (const [index, file] of input.selectedFiles.entries()) {
		ensureNotAborted(context.abortSignal);
		onProgress?.({ current: index + 1, total: input.selectedFiles.length, file });

		const result = await processOneFile(input, file, context);
		if (result.ok) {
			processed.push(file);
		} else {
			failed.push({ file, reason: result.reason });
		}
	}

	context.logger.info('hello-world:finish', {
		processed: processed.length,
		failed: failed.length,
		dryRun: context.dryRun,
	});

	return {
		processed,
		failed,
		dryRun: context.dryRun,
	};
}

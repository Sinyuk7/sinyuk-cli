import { randomUUID } from 'node:crypto';

import type { PlatformConfig } from './config/schema.js';
import { createRunLogger, type RunLogger } from './logging/logger.js';

export type EntryMode = 'cli' | 'workbench';

export type ExecutionContext = {
	runId: string;
	entryMode: EntryMode;
	configSnapshot: Readonly<PlatformConfig>;
	envSnapshot: Readonly<Record<string, string | undefined>>;
	logger: RunLogger;
	abortSignal: AbortSignal;
	dryRun: boolean;
	isTTY: boolean;
};

/**
"""Build an immutable execution context for one feature run.

INTENT: 注入 run id、配置快照、环境快照、日志器和中断信号，形成独立运行上下文
INPUT: entryMode, configSnapshot, abortSignal, dryRun, isTTY
OUTPUT: ExecutionContext
SIDE EFFECT: 初始化 run-scoped logger（会创建日志目录）
FAILURE: logger 创建失败时抛出文件系统错误
"""
 */
export function createExecutionContext(options: {
	entryMode: EntryMode;
	configSnapshot: Readonly<PlatformConfig>;
	abortSignal: AbortSignal;
	dryRun: boolean;
	isTTY: boolean;
}): ExecutionContext {
	const runId = randomUUID();

	return {
		runId,
		entryMode: options.entryMode,
		configSnapshot: options.configSnapshot,
		envSnapshot: Object.freeze({ ...process.env }),
		logger: createRunLogger(runId),
		abortSignal: options.abortSignal,
		dryRun: options.dryRun,
		isTTY: options.isTTY,
	};
}

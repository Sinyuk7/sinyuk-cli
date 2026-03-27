import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type RunLogger = {
	debug: (message: string, data?: Record<string, unknown>) => void;
	info: (message: string, data?: Record<string, unknown>) => void;
	warn: (message: string, data?: Record<string, unknown>) => void;
	error: (message: string, data?: Record<string, unknown>) => void;
};

function getLogDirPath(): string {
	return join(homedir(), '.sinyuk-cli', 'logs');
}

function writeLogLine(
	logFilePath: string,
	runId: string,
	level: LogLevel,
	message: string,
	data?: Record<string, unknown>,
): void {
	const record = {
		timestamp: new Date().toISOString(),
		runId,
		level,
		message,
		data: data ?? {},
	};

	appendFileSync(logFilePath, `${JSON.stringify(record)}\n`, 'utf8');
}

/**
"""Create a scoped JSON logger bound to one execution run id.

INTENT: 为每次执行创建可追溯的结构化日志写入器
INPUT: runId
OUTPUT: RunLogger
SIDE EFFECT: 创建 ~/.sinyuk-cli/logs/ 并写入 JSONL 日志文件
FAILURE: 当目录或文件写入失败时抛出 Node.js 文件系统错误
"""
 */
export function createRunLogger(runId: string): RunLogger {
	const logDir = getLogDirPath();
	mkdirSync(logDir, { recursive: true });

	const logFilePath = join(logDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);

	return {
		debug(message, data) {
			writeLogLine(logFilePath, runId, 'debug', message, data);
		},
		info(message, data) {
			writeLogLine(logFilePath, runId, 'info', message, data);
		},
		warn(message, data) {
			writeLogLine(logFilePath, runId, 'warn', message, data);
		},
		error(message, data) {
			writeLogLine(logFilePath, runId, 'error', message, data);
		},
	};
}

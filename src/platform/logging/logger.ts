import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { getSinyukHomePath } from '../home.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type RunLogger = {
	debug: (message: string, data?: Record<string, unknown>) => void;
	info: (message: string, data?: Record<string, unknown>) => void;
	warn: (message: string, data?: Record<string, unknown>) => void;
	error: (message: string, data?: Record<string, unknown>) => void;
};

function getLogDirPath(): string {
	return join(getSinyukHomePath(), 'logs');
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

INTENT: Create structured per-run logging without leaking log path details into feature code
INPUT: runId
OUTPUT: RunLogger
SIDE EFFECT: Create <SINYUK_HOME>/logs and append JSONL records to the daily log file
FAILURE: Propagate filesystem write errors from Node.js
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

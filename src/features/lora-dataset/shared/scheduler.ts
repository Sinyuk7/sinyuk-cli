import { setTimeout as sleep } from 'node:timers/promises';

export type ScheduledTaskItem = {
	key: string;
};

export type ScheduledTaskOutcome = {
	status: string;
};

export type ActiveWorker = {
	slot: number;
	key: string;
	attempt: number;
	startedAt: number;
};

export type SchedulerProgress = {
	total: number;
	completed: number;
	failed: number;
	activeWorkers: ActiveWorker[];
	statusCounts: Record<string, number>;
	slowdownActive: boolean;
};

export type FailedTask = {
	key: string;
	reason: string;
	attempts: number;
};

export type SchedulerResult = {
	total: number;
	failed: FailedTask[];
	statusCounts: Record<string, number>;
};

function ensureNotAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new Error('Operation cancelled.');
	}
}

function buildProgressSnapshot(options: {
	total: number;
	completed: number;
	failed: number;
	activeWorkers: Map<number, ActiveWorker>;
	statusCounts: Record<string, number>;
	slowdownActive: boolean;
}): SchedulerProgress {
	return {
		total: options.total,
		completed: options.completed,
		failed: options.failed,
		activeWorkers: [...options.activeWorkers.values()].sort((left, right) => left.slot - right.slot),
		statusCounts: { ...options.statusCounts },
		slowdownActive: options.slowdownActive,
	};
}

/**
"""Run a bounded-concurrency task queue with retries and global slowdown protection.

INTENT: 为批量 caption 任务提供统一调度层，处理并发、重试、失败聚合和全局降速
INPUT: items, concurrency, maxRetries, abortSignal, runTask, isRetryableError, onProgress
OUTPUT: SchedulerResult
SIDE EFFECT: 异步执行任务并通过 onProgress 推送运行快照
FAILURE: 仅在 abortSignal 取消时抛出 Error；单项失败会聚合到结果中继续执行
"""
 */
export async function runScheduledTasks<TItem extends ScheduledTaskItem>(options: {
	items: TItem[];
	concurrency: number;
	maxRetries: number;
	abortSignal: AbortSignal;
	runTask: (item: TItem, attempt: number) => Promise<ScheduledTaskOutcome>;
	isRetryableError: (error: unknown) => boolean;
	onProgress?: (progress: SchedulerProgress) => void;
}): Promise<SchedulerResult> {
	const statusCounts: Record<string, number> = {};
	const failed: FailedTask[] = [];
	const activeWorkers = new Map<number, ActiveWorker>();
	const workerCount = Math.min(options.concurrency, Math.max(1, options.items.length));
	let completed = 0;
	let failedCount = 0;
	let nextIndex = 0;
	let slowdownUntil = 0;
	let slowdownActive = false;

	const emit = () =>
		options.onProgress?.(
			buildProgressSnapshot({
				total: options.items.length,
				completed,
				failed: failedCount,
				activeWorkers,
				statusCounts,
				slowdownActive,
			}),
		);

	const processOne = async (item: TItem, slot: number): Promise<void> => {
		let attempt = 0;

		while (true) {
			ensureNotAborted(options.abortSignal);
			attempt += 1;
			activeWorkers.set(slot, {
				slot,
				key: item.key,
				attempt,
				startedAt: Date.now(),
			});
			emit();

			try {
				const outcome = await options.runTask(item, attempt);
				statusCounts[outcome.status] = (statusCounts[outcome.status] ?? 0) + 1;
				completed += 1;
				activeWorkers.delete(slot);
				emit();
				return;
			} catch (error) {
				activeWorkers.delete(slot);

				if (options.isRetryableError(error) && attempt <= options.maxRetries + 1) {
					slowdownUntil = Date.now() + Math.min(4000, 500 * 2 ** (attempt - 1));
					emit();
					await sleep(Math.min(4000, 500 * 2 ** (attempt - 1)), undefined, {
						signal: options.abortSignal,
					});
					continue;
				}

				failed.push({
					key: item.key,
					reason: (error as Error).message,
					attempts: attempt,
				});
				failedCount += 1;
				completed += 1;
				emit();
				return;
			}
		}
	};

	const worker = async (slot: number): Promise<void> => {
		while (true) {
			ensureNotAborted(options.abortSignal);
			if (nextIndex >= options.items.length) {
				return;
			}

			const current = options.items[nextIndex];
			nextIndex += 1;

			const waitMs = Math.max(0, slowdownUntil - Date.now());
			if (waitMs > 0) {
				slowdownActive = true;
				emit();
				await sleep(waitMs, undefined, { signal: options.abortSignal });
				slowdownActive = false;
				emit();
			}

			await processOne(current, slot);
		}
	};

	emit();
	await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));

	return {
		total: options.items.length,
		failed,
		statusCounts,
	};
}

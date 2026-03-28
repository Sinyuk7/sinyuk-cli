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
"""Run a bounded-concurrency task queue with per-worker retry jitter.

INTENT: Keep the scheduler boring by using a fixed worker pool plus per-task retry backoff instead of dynamic concurrency scaling
INPUT: items, concurrency, maxRetries, retryBaseDelayMs, retryMaxDelayMs, abortSignal, runTask, isRetryableError, onProgress
OUTPUT: SchedulerResult
SIDE EFFECT: Execute async tasks and emit progress snapshots
FAILURE: Throw Error only when abortSignal cancels the run; per-item failures are aggregated in the result
"""
 */
export async function runScheduledTasks<TItem extends ScheduledTaskItem>(options: {
	items: TItem[];
	concurrency: number;
	maxRetries: number;
	retryBaseDelayMs: number;
	retryMaxDelayMs: number;
	abortSignal: AbortSignal;
	runTask: (item: TItem, attempt: number) => Promise<ScheduledTaskOutcome>;
	isRetryableError: (error: unknown) => boolean;
	onProgress?: (progress: SchedulerProgress) => void;
}): Promise<SchedulerResult> {
	const statusCounts: Record<string, number> = {};
	const failed: FailedTask[] = [];
	const activeWorkers = new Map<number, ActiveWorker>();
	const backoffWorkers = new Set<number>();
	const workerCount = Math.min(options.concurrency, Math.max(1, options.items.length));
	let completed = 0;
	let failedCount = 0;
	let nextIndex = 0;

	const emit = () =>
		options.onProgress?.(
			buildProgressSnapshot({
				total: options.items.length,
				completed,
				failed: failedCount,
				activeWorkers,
				statusCounts,
				slowdownActive: backoffWorkers.size > 0,
			}),
		);

	const getRetryDelayMs = (attemptIndex: number): number => {
		const ceiling = Math.min(
			options.retryMaxDelayMs,
			options.retryBaseDelayMs * 2 ** attemptIndex,
		);
		if (ceiling <= options.retryBaseDelayMs) {
			return options.retryBaseDelayMs;
		}

		return Math.floor(
			Math.random() * (ceiling - options.retryBaseDelayMs) + options.retryBaseDelayMs,
		);
	};

	const processOne = async (item: TItem, slot: number): Promise<void> => {
		for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
			ensureNotAborted(options.abortSignal);
			const attemptNumber = attempt + 1;
			activeWorkers.set(slot, {
				slot,
				key: item.key,
				attempt: attemptNumber,
				startedAt: Date.now(),
			});
			emit();

			try {
				const outcome = await options.runTask(item, attemptNumber);
				statusCounts[outcome.status] = (statusCounts[outcome.status] ?? 0) + 1;
				completed += 1;
				activeWorkers.delete(slot);
				emit();
				return;
			} catch (error) {
				activeWorkers.delete(slot);

				if (options.isRetryableError(error) && attempt < options.maxRetries) {
					backoffWorkers.add(slot);
					emit();
					try {
						await sleep(getRetryDelayMs(attempt), undefined, {
							signal: options.abortSignal,
						});
						continue;
					} finally {
						backoffWorkers.delete(slot);
						emit();
					}
				}

				failed.push({
					key: item.key,
					reason: (error as Error).message,
					attempts: attemptNumber,
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

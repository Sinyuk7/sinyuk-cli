/**
 * Tests for the fixed-concurrency scheduler retry contract.
 *
 * INTENT: Lock down retry counts so jitter/backoff refactors do not reintroduce off-by-one behavior
 * INPUT: In-memory task runners
 * OUTPUT: Scheduler success/failure summaries
 * SIDE EFFECT: None beyond async timers
 * FAILURE: Test fails when retry counts drift
 */

import { RetryableProviderError } from '../shared/provider.js';
import { runScheduledTasks } from '../shared/scheduler.js';

describe('runScheduledTasks', () => {
	test('succeeds on the final allowed retry without one extra attempt', async () => {
		const attempts: number[] = [];

		const result = await runScheduledTasks({
			items: [{ key: 'image-1' }],
			concurrency: 1,
			maxRetries: 2,
			retryBaseDelayMs: 1,
			retryMaxDelayMs: 2,
			abortSignal: AbortSignal.timeout(5_000),
			isRetryableError: (error) => error instanceof RetryableProviderError,
			runTask: async (_item, attempt) => {
				attempts.push(attempt);
				if (attempt < 3) {
					throw new RetryableProviderError(`retry ${attempt}`);
				}

				return { status: 'captioned' };
			},
		});

		expect(attempts).toEqual([1, 2, 3]);
		expect(result.failed).toHaveLength(0);
		expect(result.statusCounts['captioned']).toBe(1);
	});

	test('fails after first attempt plus maxRetries only', async () => {
		const attempts: number[] = [];

		const result = await runScheduledTasks({
			items: [{ key: 'image-1' }],
			concurrency: 1,
			maxRetries: 2,
			retryBaseDelayMs: 1,
			retryMaxDelayMs: 2,
			abortSignal: AbortSignal.timeout(5_000),
			isRetryableError: (error) => error instanceof RetryableProviderError,
			runTask: async (_item, attempt) => {
				attempts.push(attempt);
				throw new RetryableProviderError(`retry ${attempt}`);
			},
		});

		expect(attempts).toEqual([1, 2, 3]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]?.attempts).toBe(3);
	});
});

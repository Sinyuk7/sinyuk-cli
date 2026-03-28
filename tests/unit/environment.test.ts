import { describe, expect, test, vi } from 'vitest';

import {
	createEnvironmentSnapshot,
	persistEnvironmentVariable,
} from '../../src/platform/environment.js';

describe('createEnvironmentSnapshot', () => {
	test('overlays persisted Windows user env when the current process env is missing a key', () => {
		const snapshot = createEnvironmentSnapshot({
			baseEnv: { PATH: 'C:\\Windows\\System32' },
			platform: 'win32',
			loadWindowsUserEnv: () => ({
				N1N_API_KEY: 'saved-key',
				PATH: 'C:\\Persisted',
			}),
		});

		expect(snapshot.N1N_API_KEY).toBe('saved-key');
		expect(snapshot.PATH).toBe('C:\\Windows\\System32');
	});

	test('prefers current process env over persisted Windows user env', () => {
		const snapshot = createEnvironmentSnapshot({
			baseEnv: {
				N1N_API_KEY: 'process-key',
			},
			platform: 'win32',
			loadWindowsUserEnv: () => ({
				N1N_API_KEY: 'persisted-key',
			}),
		});

		expect(snapshot.N1N_API_KEY).toBe('process-key');
	});
});

describe('persistEnvironmentVariable', () => {
	test('updates process env even outside Windows', async () => {
		const previousValue = process.env.TEST_ENV_PERSIST;
		delete process.env.TEST_ENV_PERSIST;

		try {
			await persistEnvironmentVariable('TEST_ENV_PERSIST', 'value-123', {
				platform: 'linux',
			});

			expect(process.env.TEST_ENV_PERSIST).toBe('value-123');
		} finally {
			if (previousValue === undefined) {
				delete process.env.TEST_ENV_PERSIST;
			} else {
				process.env.TEST_ENV_PERSIST = previousValue;
			}
		}
	});

	test('persists Windows user env via the injected writer', async () => {
		const writeWindowsUserEnv = vi.fn().mockResolvedValue(undefined);
		const previousValue = process.env.TEST_ENV_PERSIST;
		delete process.env.TEST_ENV_PERSIST;

		try {
			await persistEnvironmentVariable('TEST_ENV_PERSIST', 'value-456', {
				platform: 'win32',
				writeWindowsUserEnv,
			});

			expect(process.env.TEST_ENV_PERSIST).toBe('value-456');
			expect(writeWindowsUserEnv).toHaveBeenCalledWith('TEST_ENV_PERSIST', 'value-456');
		} finally {
			if (previousValue === undefined) {
				delete process.env.TEST_ENV_PERSIST;
			} else {
				process.env.TEST_ENV_PERSIST = previousValue;
			}
		}
	});
});

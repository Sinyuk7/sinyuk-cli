import { persistEnvironmentVariable } from '../../../platform/environment.js';
import { ProviderFatalError } from './provider.js';

const MISSING_API_KEY_PREFIX = 'Missing required environment variable: ';

/**
"""Return true when the provider error is the expected missing-api-key failure.

INTENT: Let interactive caption flows branch into credential recovery without string duplication
INPUT: error, envName
OUTPUT: boolean
SIDE EFFECT: None
FAILURE: None
"""
 */
export function isMissingApiKeyError(error: unknown, envName: string): boolean {
	return (
		error instanceof ProviderFatalError &&
		error.message === `${MISSING_API_KEY_PREFIX}${envName}`
	);
}

/**
"""Persist an API key into the current process and the Windows user environment.

INTENT: Let interactive caption flows recover from missing credentials once and keep future sessions usable
INPUT: envName, apiKey
OUTPUT: None
SIDE EFFECT: Mutate process.env and, on Windows, write one user-scoped environment variable
FAILURE: Throw Error when envName is invalid or Windows persistence fails
"""
 */
export async function persistApiKeyToEnvironment(
	envName: string,
	apiKey: string,
): Promise<void> {
	await persistEnvironmentVariable(envName, apiKey);
}

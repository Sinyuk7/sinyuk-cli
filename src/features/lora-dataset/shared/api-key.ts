import { spawn } from 'node:child_process';

import { ProviderFatalError } from './provider.js';

const MISSING_API_KEY_PREFIX = 'Missing required environment variable: ';

function validateEnvironmentVariableName(envName: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
		throw new Error(`Invalid environment variable name: ${envName}`);
	}
}

async function persistWindowsUserEnvironmentVariable(
	envName: string,
	value: string,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(
			'powershell.exe',
			[
				'-NoProfile',
				'-Command',
				[
					'$payload = [Console]::In.ReadToEnd()',
					'$data = $payload | ConvertFrom-Json',
					"[Environment]::SetEnvironmentVariable($data.name, $data.value, 'User')",
				].join('; '),
			],
			{ stdio: ['pipe', 'ignore', 'pipe'] },
		);
		let stderr = '';

		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(
				new Error(
					stderr.trim().length > 0
						? stderr.trim()
						: `powershell.exe exited with code ${code ?? 'unknown'}.`,
				),
			);
		});

		child.stdin.end(JSON.stringify({ name: envName, value }));
	});
}

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
	validateEnvironmentVariableName(envName);
	process.env[envName] = apiKey;

	if (process.platform !== 'win32') {
		return;
	}

	await persistWindowsUserEnvironmentVariable(envName, apiKey);
}

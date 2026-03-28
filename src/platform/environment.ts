import { spawn, spawnSync } from 'node:child_process';

type EnvironmentRecord = Record<string, string | undefined>;

type CreateEnvironmentSnapshotOptions = {
	baseEnv?: Readonly<Record<string, string | undefined>>;
	platform?: NodeJS.Platform;
	loadWindowsUserEnv?: () => EnvironmentRecord;
};

type PersistEnvironmentVariableOptions = {
	platform?: NodeJS.Platform;
	writeWindowsUserEnv?: (envName: string, value: string) => Promise<void>;
};

function validateEnvironmentVariableName(envName: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
		throw new Error(`Invalid environment variable name: ${envName}`);
	}
}

function parseEnvironmentJson(rawText: string): EnvironmentRecord {
	const trimmed = rawText.trim();
	if (trimmed.length === 0) {
		return {};
	}

	const parsed = JSON.parse(trimmed) as
		| { name?: unknown; value?: unknown }
		| Array<{ name?: unknown; value?: unknown }>;
	const entries = Array.isArray(parsed) ? parsed : [parsed];
	return Object.fromEntries(
		entries
			.filter(
				(entry): entry is { name: string; value: string } =>
					typeof entry.name === 'string' && typeof entry.value === 'string',
			)
			.map((entry) => [entry.name, entry.value]),
	);
}

function readWindowsUserEnvironmentVariables(): EnvironmentRecord {
	const result = spawnSync(
		'powershell.exe',
		[
			'-NoProfile',
			'-Command',
			[
				"[Environment]::GetEnvironmentVariables('User').GetEnumerator()",
				'| ForEach-Object { @{ name = $_.Key; value = $_.Value } }',
				'| ConvertTo-Json -Compress',
			].join(' '),
		],
		{ encoding: 'utf8' },
	);

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(
			result.stderr?.trim().length
				? result.stderr.trim()
				: `powershell.exe exited with code ${result.status ?? 'unknown'}.`,
		);
	}

	return parseEnvironmentJson(result.stdout ?? '');
}

async function writeWindowsUserEnvironmentVariable(
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
"""Build a run-scoped environment snapshot with persisted Windows user vars overlaid.

INTENT: Keep feature execution deterministic even when a parent shell has not reloaded freshly persisted user environment variables
INPUT: optional baseEnv, platform, loadWindowsUserEnv
OUTPUT: immutable environment snapshot
SIDE EFFECT: On Windows, may spawn one local PowerShell process to read the user environment block
FAILURE: Throw Error when the Windows user environment cannot be read
"""
 */
export function createEnvironmentSnapshot(
	options: CreateEnvironmentSnapshotOptions = {},
): Readonly<Record<string, string | undefined>> {
	const baseEnv = options.baseEnv ?? process.env;
	const platform = options.platform ?? process.platform;
	if (platform !== 'win32') {
		return Object.freeze({ ...baseEnv });
	}

	const loadWindowsUserEnv = options.loadWindowsUserEnv ?? readWindowsUserEnvironmentVariables;
	const persistedUserEnv = loadWindowsUserEnv();
	return Object.freeze({
		...persistedUserEnv,
		...baseEnv,
	});
}

/**
"""Persist one environment variable for the current process and the Windows user profile.

INTENT: Provide one reusable platform-level capability for interactive credential capture flows across features
INPUT: envName, value, optional platform and writeWindowsUserEnv override
OUTPUT: None
SIDE EFFECT: Mutate process.env and, on Windows, write one user-scoped environment variable
FAILURE: Throw Error when envName is invalid or persistence fails
"""
 */
export async function persistEnvironmentVariable(
	envName: string,
	value: string,
	options: PersistEnvironmentVariableOptions = {},
): Promise<void> {
	validateEnvironmentVariableName(envName);
	process.env[envName] = value;

	const platform = options.platform ?? process.platform;
	if (platform !== 'win32') {
		return;
	}

	const writeUserEnv = options.writeWindowsUserEnv ?? writeWindowsUserEnvironmentVariable;
	await writeUserEnv(envName, value);
}

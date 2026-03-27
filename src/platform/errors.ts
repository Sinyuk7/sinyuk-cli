export class CliError extends Error {
	readonly code: string;
	override readonly cause?: unknown;

	constructor(message: string, code: string, cause?: unknown) {
		super(message);
		this.name = 'CliError';
		this.code = code;
		this.cause = cause;
	}
}

export class ConfigError extends CliError {
	constructor(message: string, cause?: unknown) {
		super(message, 'CONFIG_ERROR', cause);
		this.name = 'ConfigError';
	}
}

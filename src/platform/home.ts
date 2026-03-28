import { homedir } from 'node:os';
import { join } from 'node:path';

const SINYUK_HOME_ENV = 'SINYUK_HOME';

/**
"""Resolve the root home directory for all sinyuk-cli user-scoped files.

INTENT: Provide one canonical location for global config, logs, and feature home directories
INPUT: none
OUTPUT: absolute home directory path
SIDE EFFECT: None
FAILURE: None
"""
 */
export function getSinyukHomePath(homePathOverride?: string): string {
	if (homePathOverride) {
		return homePathOverride;
	}

	const envOverride = process.env[SINYUK_HOME_ENV]?.trim();
	if (envOverride) {
		return envOverride;
	}

	return join(homedir(), '.sinyuk-cli');
}

/**
"""Resolve the global config file path inside SINYUK_HOME.

INTENT: Keep platform-scoped config in one well-known file under the canonical home directory
INPUT: none
OUTPUT: absolute config.yaml path
SIDE EFFECT: None
FAILURE: None
"""
 */
export function getGlobalConfigPath(homePath?: string): string {
	return join(getSinyukHomePath(homePath), 'config.yaml');
}

/**
"""Resolve the home directory for one feature domain.

INTENT: Give each feature a stable private directory for its own config, prompts, cache, and state
INPUT: featureId
OUTPUT: absolute feature home directory path
SIDE EFFECT: None
FAILURE: None
"""
 */
export function getFeatureHomePath(featureId: string, homePath?: string): string {
	return join(getSinyukHomePath(homePath), 'features', featureId);
}

/**
"""Resolve the feature-scoped config file path for one feature domain.

INTENT: Standardize per-feature config storage so domains do not share or trample one another's files
INPUT: featureId
OUTPUT: absolute feature config.yaml path
SIDE EFFECT: None
FAILURE: None
"""
 */
export function getFeatureConfigPath(featureId: string, homePath?: string): string {
	return join(getFeatureHomePath(featureId, homePath), 'config.yaml');
}

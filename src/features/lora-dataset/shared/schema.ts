import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { z } from 'zod';

import type { PlatformConfig } from '../../../platform/config/schema.js';
import { ConfigError } from '../../../platform/errors.js';

const RatioTextSchema = z.string().regex(/^\d+:\d+$/, 'must use WIDTH:HEIGHT format');

export const LoraDatasetCropProfileSchema = z
	.object({
		ratio: RatioTextSchema,
		longEdge: z.number().int().positive(),
	})
	.strict();

export const LoraDatasetProviderConfigSchema = z
	.object({
		baseUrl: z.string().url(),
		fallbackBaseUrl: z.string().url().nullable(),
		model: z.string().min(1),
		apiKeyEnv: z.string().min(1),
	})
	.strict();

export const LoraDatasetSchedulerConfigSchema = z
	.object({
		concurrency: z.number().int().positive(),
		timeoutSeconds: z.number().int().positive(),
		maxRetries: z.number().int().min(0),
		retryBaseDelayMs: z.number().int().positive(),
		retryMaxDelayMs: z.number().int().positive(),
		circuitBreakerFailureThreshold: z.number().int().positive(),
	})
	.strict()
	.refine((value) => value.retryMaxDelayMs >= value.retryBaseDelayMs, {
		message: 'retryMaxDelayMs must be greater than or equal to retryBaseDelayMs',
		path: ['retryMaxDelayMs'],
	});

export const LoraDatasetAnalysisConfigSchema = z
	.object({
		longEdge: z.number().int().positive(),
		jpegQuality: z.number().int().min(1).max(100),
	})
	.strict();

export const LoraDatasetFeatureConfigSchema = z
	.object({
		provider: LoraDatasetProviderConfigSchema,
		scheduler: LoraDatasetSchedulerConfigSchema,
		analysis: LoraDatasetAnalysisConfigSchema,
		cropProfiles: z.array(LoraDatasetCropProfileSchema).min(1),
	})
	.strict();

export const LoraDatasetRequestConfigSchema = z
	.object({
		temperature: z.number().min(0).max(2),
		topP: z.number().gt(0).max(1),
		maxOutputTokens: z.number().int().positive(),
	})
	.strict();

export const LoraDatasetCaptionAssemblyConfigSchema = z
	.object({
		separator: z.string().min(1),
		keepSubjectFirst: z.boolean(),
	})
	.strict();

export const LoraDatasetDatasetConfigSchema = z
	.object({
		request: LoraDatasetRequestConfigSchema,
		captionAssembly: LoraDatasetCaptionAssemblyConfigSchema,
	})
	.strict();

export type LoraDatasetCropProfile = z.infer<typeof LoraDatasetCropProfileSchema>;
export type LoraDatasetFeatureConfig = z.infer<typeof LoraDatasetFeatureConfigSchema>;
export type LoraDatasetProviderConfig = z.infer<typeof LoraDatasetProviderConfigSchema>;
export type LoraDatasetSchedulerConfig = z.infer<typeof LoraDatasetSchedulerConfigSchema>;
export type LoraDatasetAnalysisConfig = z.infer<typeof LoraDatasetAnalysisConfigSchema>;
export type LoraDatasetDatasetConfig = z.infer<typeof LoraDatasetDatasetConfigSchema>;

/**
"""Read and validate the lora-dataset feature config from the platform snapshot.

INTENT: Enforce an explicit config contract for user-level lora-dataset defaults before execution
INPUT: configSnapshot
OUTPUT: LoraDatasetFeatureConfig
SIDE EFFECT: None
FAILURE: Throw ConfigError when the feature config is missing, invalid, or incomplete
"""
 */
export function getLoraDatasetFeatureConfig(
	configSnapshot: Readonly<PlatformConfig>,
): LoraDatasetFeatureConfig {
	const section = configSnapshot.features?.['lora-dataset'];
	const parsed = LoraDatasetFeatureConfigSchema.safeParse(section);

	if (!parsed.success) {
		throw new ConfigError(
			`[Config Error] Invalid feature config for "lora-dataset": ${parsed.error.issues
				.map((issue) => `${issue.path.join('.') || 'root'} ${issue.message}`)
				.join('; ')}`,
		);
	}

	return parsed.data;
}

/**
"""Read and validate the dataset-local lora-dataset config file from disk.

INTENT: Enforce a strict per-dataset request contract with no runtime fallback injection
INPUT: absolute dataset-local config path
OUTPUT: LoraDatasetDatasetConfig
SIDE EFFECT: Read one YAML file from disk
FAILURE: Throw ConfigError when the YAML is missing, invalid, or incomplete
"""
 */
export function loadLoraDatasetDatasetConfig(configPath: string): LoraDatasetDatasetConfig {
	let rawConfig: unknown;

	try {
		rawConfig = parse(readFileSync(configPath, 'utf8'));
	} catch (error) {
		throw new ConfigError(
			`Failed to parse dataset config at ${configPath}: ${(error as Error).message}`,
			error,
		);
	}

	const parsed = LoraDatasetDatasetConfigSchema.safeParse(rawConfig);
	if (!parsed.success) {
		throw new ConfigError(
			`[Config Error] Invalid dataset config at ${configPath}: ${parsed.error.issues
				.map((issue) => `${issue.path.join('.') || 'root'} ${issue.message}`)
				.join('; ')}`,
		);
	}

	return parsed.data;
}

export function formatCropProfileId(profile: LoraDatasetCropProfile): string {
	return `${profile.ratio}@${profile.longEdge}`;
}

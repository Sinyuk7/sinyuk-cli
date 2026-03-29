import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { z } from 'zod';

import type { PlatformConfig } from '../../../platform/config/schema.js';
import { ConfigError } from '../../../platform/errors.js';

const RatioTextSchema = z.string().regex(/^\d+:\d+$/, 'must use WIDTH:HEIGHT format');
const PositiveIntSchema = z.number().int().positive();

export const LoraDatasetCropProfileSchema = z
	.object({
		ratio: RatioTextSchema,
		longEdge: PositiveIntSchema,
	})
	.strict();

export const LoraDatasetCropConfigSchema = z
	.object({
		ratioOptions: z.array(RatioTextSchema).min(1),
		resolutionOptions: z.array(PositiveIntSchema).min(1),
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
		concurrency: PositiveIntSchema,
		timeoutSeconds: PositiveIntSchema,
		maxRetries: z.number().int().min(0),
		retryBaseDelayMs: PositiveIntSchema,
		retryMaxDelayMs: PositiveIntSchema,
	})
	.strict()
	.refine((value) => value.retryMaxDelayMs >= value.retryBaseDelayMs, {
		message: 'retryMaxDelayMs must be greater than or equal to retryBaseDelayMs',
		path: ['retryMaxDelayMs'],
	});

export const LoraDatasetAnalysisConfigSchema = z
	.object({
		longEdge: PositiveIntSchema,
		jpegQuality: z.number().int().min(1).max(100),
	})
	.strict();

export const LoraDatasetFeatureConfigSchema = z
	.object({
		provider: LoraDatasetProviderConfigSchema,
		scheduler: LoraDatasetSchedulerConfigSchema,
		analysis: LoraDatasetAnalysisConfigSchema,
		crop: LoraDatasetCropConfigSchema,
	})
	.strict();

export const LoraDatasetRequestConfigSchema = z
	.object({
		temperature: z.number().min(0).max(2),
		topP: z.number().gt(0).max(1),
		maxOutputTokens: z.number().int().positive(),
	})
	.strict();

const CaptionOutputFieldSchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'must use letters, numbers, "_" or "-"');

export const LoraDatasetCaptionAssemblyConfigSchema = z
	.object({
		separator: z.string().min(1),
		outputFields: z.array(CaptionOutputFieldSchema).min(1),
	})
	.strict()
	.refine((value) => new Set(value.outputFields).size === value.outputFields.length, {
		message: 'outputFields must not contain duplicates',
		path: ['outputFields'],
	});

export const LoraDatasetDatasetConfigSchema = z
	.object({
		request: LoraDatasetRequestConfigSchema,
		captionAssembly: LoraDatasetCaptionAssemblyConfigSchema,
	})
	.strict();

export type LoraDatasetCropProfile = z.infer<typeof LoraDatasetCropProfileSchema>;
export type LoraDatasetCropConfig = z.infer<typeof LoraDatasetCropConfigSchema>;
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

/**
"""Convert a WIDTH:HEIGHT ratio string into a comparable decimal value.

INTENT: Centralize crop ratio math so planning and execution use the same interpretation
INPUT: ratio text like 3:4
OUTPUT: decimal width/height ratio
SIDE EFFECT: None
FAILURE: Throw Error when the ratio format is invalid
"""
 */
export function parseCropRatioValue(ratio: string): number {
	const parsed = RatioTextSchema.safeParse(ratio);
	if (!parsed.success) {
		throw new Error(`Invalid crop ratio "${ratio}". Expected WIDTH:HEIGHT.`);
	}

	const [widthText, heightText] = ratio.split(':');
	return Number(widthText) / Number(heightText);
}

/**
"""Derive the target crop width and height from ratio and long edge.

INTENT: Keep crop output sizing deterministic across planning, preview, and execution
INPUT: crop profile with ratio and longEdge
OUTPUT: { width, height }
SIDE EFFECT: None
FAILURE: Throw Error when the ratio format is invalid
"""
 */
export function deriveCropTargetSize(profile: LoraDatasetCropProfile): {
	width: number;
	height: number;
} {
	const ratioValue = parseCropRatioValue(profile.ratio);
	if (ratioValue >= 1) {
		return {
			width: profile.longEdge,
			height: Math.round(profile.longEdge / ratioValue),
		};
	}

	return {
		width: Math.round(profile.longEdge * ratioValue),
		height: profile.longEdge,
	};
}

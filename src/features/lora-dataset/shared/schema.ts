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

export const LoraDatasetFeatureConfigSchema = z
	.object({
		provider: z
			.object({
				baseUrl: z.string().url(),
				model: z.string().min(1),
				apiKeyEnv: z.string().min(1),
				concurrency: z.number().int().positive(),
				timeoutSeconds: z.number().int().positive(),
				maxRetries: z.number().int().min(0),
				analysisLongEdge: z.number().int().positive(),
				analysisJpegQuality: z.number().int().min(1).max(100),
			})
			.strict(),
		cropProfiles: z.array(LoraDatasetCropProfileSchema).min(1),
	})
	.strict();

export type LoraDatasetCropProfile = z.infer<typeof LoraDatasetCropProfileSchema>;
export type LoraDatasetFeatureConfig = z.infer<typeof LoraDatasetFeatureConfigSchema>;

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

export function formatCropProfileId(profile: LoraDatasetCropProfile): string {
	return `${profile.ratio}@${profile.longEdge}`;
}

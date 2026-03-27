import { z } from 'zod';

import { ConfigError } from '../../platform/errors.js';
import type { PlatformConfig } from '../../platform/config/schema.js';

export const HelloWorldFeatureConfigSchema = z
	.object({
		includeHidden: z.boolean().optional(),
	})
	.strict();

export type HelloWorldFeatureConfig = z.infer<typeof HelloWorldFeatureConfigSchema>;

export function getHelloWorldFeatureConfig(
	configSnapshot: Readonly<PlatformConfig>,
): HelloWorldFeatureConfig {
	const section = configSnapshot.features?.['hello-world'];
	const parsed = HelloWorldFeatureConfigSchema.safeParse(section ?? {});

	if (!parsed.success) {
		throw new ConfigError(
			`[Config Error] Invalid feature config for "hello-world": ${parsed.error.issues
				.map((issue) => `${issue.path.join('.') || 'root'} ${issue.message}`)
				.join('; ')}`,
		);
	}

	return parsed.data;
}

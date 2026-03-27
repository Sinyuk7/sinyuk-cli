import { z } from 'zod';

export const PlatformConfigSchema = z
	.object({
		features: z.record(z.string(), z.unknown()).optional(),
		logging: z
			.object({
				level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
			})
			.optional(),
	})
	.strict();

export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;

export type LoadedConfig = {
	globalPath: string;
	projectPath: string;
	projectLoaded: boolean;
	config: Readonly<PlatformConfig>;
};

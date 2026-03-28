import { Command } from 'clipanion';
import { stringify } from 'yaml';

import { getCommandCwd, type SinyukCliContext } from '../cli/context.js';
import { loadResolvedConfig } from '../platform/config/load-config.js';

/**
"""Render resolved config and source paths in a plain-text output.

INTENT: Show the merged config together with every source path that contributed to it
INPUT: Command context cwd
OUTPUT: stdout text report
SIDE EFFECT: Read YAML config files from SINYUK_HOME and the current workspace
FAILURE: Throw ConfigError when config loading or validation fails
"""
 */
export class ConfigShowCommand extends Command<SinyukCliContext> {
	static override paths = [['config', 'show']];

	static override usage = Command.Usage({
		category: 'Config',
		description: 'Show resolved merged configuration',
		examples: [['Show merged config', '$0 config show']],
	});

	override async execute(): Promise<number> {
		const cwd = getCommandCwd(this.context);
		const loaded = loadResolvedConfig({ cwd });
		const mergedConfigYaml = stringify(loaded.config);
		const projectStatus = loaded.projectLoaded ? 'Loaded' : 'Not Found';

		this.context.stdout.write('Config Sources\n');
		this.context.stdout.write(`- Sinyuk Home: ${loaded.sinyukHomePath}\n`);
		this.context.stdout.write(`- Global: ${loaded.globalPath} (Loaded)\n`);
		for (const featureConfigPath of loaded.featureConfigPaths) {
			this.context.stdout.write(`- Feature: ${featureConfigPath} (Loaded)\n`);
		}
		this.context.stdout.write(`- Project: ${loaded.projectPath} (${projectStatus})\n\n`);
		this.context.stdout.write('Resolved Config (YAML)\n');
		this.context.stdout.write(mergedConfigYaml);

		return 0;
	}
}

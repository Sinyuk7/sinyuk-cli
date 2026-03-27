import { Cli } from 'clipanion';

import { ConfigShowCommand } from './commands/config-show.js';
import { InitCommand } from './commands/init.js';
import { WorkbenchCommand } from './commands/workbench.js';
import { getFeatureRegistry } from './features/index.js';
import type { SinyukCliContext } from './cli/context.js';

function createCli(): Cli<SinyukCliContext> {
	const featureCommands = getFeatureRegistry().map((feature) => feature.getCommand());

	return Cli.from<SinyukCliContext>(
		[ConfigShowCommand, InitCommand, WorkbenchCommand, ...featureCommands],
		{
			binaryName: 'sinyuk-cli',
			binaryLabel: 'Sinyuk CLI',
			binaryVersion: '0.1.0',
		},
	);
}

async function main(): Promise<void> {
	const cli = createCli();
	await cli.runExit(process.argv.slice(2), { cwd: process.cwd() });
}

await main();

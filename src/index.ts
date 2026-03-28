import { Cli } from 'clipanion';

import { ConfigResetLoraDatasetCommand } from './commands/config-reset-lora-dataset.js';
import { ConfigShowCommand } from './commands/config-show.js';
import { InitCommand } from './commands/init.js';
import { WorkbenchCommand } from './commands/workbench.js';
import { getFeatureDomains } from './features/index.js';
import type { SinyukCliContext } from './cli/context.js';

function createCli(): Cli<SinyukCliContext> {
	const domains = getFeatureDomains();
	const domainCommands = domains.flatMap((domain) => domain.getCliCommands?.() ?? []);
	const actionCommands = domains.flatMap((domain) => domain.actions.map((action) => action.getCommand()));

	return Cli.from<SinyukCliContext>(
		[
			ConfigShowCommand,
			ConfigResetLoraDatasetCommand,
			InitCommand,
			WorkbenchCommand,
			...domainCommands,
			...actionCommands,
		],
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

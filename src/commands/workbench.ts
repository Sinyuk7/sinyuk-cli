import { Command } from 'clipanion';
import React from 'react';
import { render } from 'ink';

import { getCommandCwd, isInteractiveTty, type SinyukCliContext } from '../cli/context.js';
import { getFeatureRegistry } from '../features/index.js';
import { loadResolvedConfig } from '../platform/config/load-config.js';
import { createExecutionContext } from '../platform/execution-context.js';
import { createShutdownController } from '../platform/shutdown/controller.js';
import { WorkbenchApp } from '../workbench/app.js';

export class WorkbenchCommand extends Command<SinyukCliContext> {
	static override paths = [Command.Default];

	static override usage = Command.Usage({
		category: 'Workbench',
		description: 'Open sinyuk interactive workbench',
	});

	override async execute(): Promise<number> {
		const shutdown = createShutdownController();

		try {
			const cwd = getCommandCwd(this.context);
			const loaded = loadResolvedConfig({ cwd });
			const features = getFeatureRegistry();
			const isTTY = isInteractiveTty(this.context);

			let app: ReturnType<typeof render>;
			app = render(
				React.createElement(WorkbenchApp, {
					features,
					configSnapshot: loaded.config,
					configInfo: {
						globalPath: loaded.globalPath,
						projectPath: loaded.projectPath,
						projectLoaded: loaded.projectLoaded,
					},
					abortSignal: shutdown.signal,
					createExecutionContext: ({
						entryMode,
						dryRun,
					}: {
						entryMode: 'cli' | 'workbench';
						dryRun: boolean;
					}) =>
						createExecutionContext({
							entryMode,
							configSnapshot: loaded.config,
							abortSignal: shutdown.signal,
							dryRun,
							isTTY,
						}),
					onExit: () => app.unmount(),
				}),
				{
					stdin: this.context.stdin,
					stdout: this.context.stdout,
					stderr: this.context.stderr,
				},
			);

			await app.waitUntilExit();
			return 0;
		} finally {
			shutdown.dispose();
		}
	}
}

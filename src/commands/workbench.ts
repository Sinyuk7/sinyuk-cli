import { Command } from 'clipanion';
import type { ReadStream, WriteStream } from 'node:tty';
import React from 'react';
import { render } from 'ink';

import { getCommandCwd, isInteractiveTty, type SinyukCliContext } from '../cli/context.js';
import { getFeatureDomains } from '../features/index.js';
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
			const domains = getFeatureDomains();
			const isTTY = isInteractiveTty(this.context);

			let app: ReturnType<typeof render>;
			app = render(
				React.createElement(WorkbenchApp, {
					domains,
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
				stdin: this.context.stdin as unknown as ReadStream,
				stdout: this.context.stdout as unknown as WriteStream,
				stderr: this.context.stderr as unknown as WriteStream,
			},
			);

			await app.waitUntilExit();
			return 0;
		} finally {
			shutdown.dispose();
		}
	}
}

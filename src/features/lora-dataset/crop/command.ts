import { Command, Option } from 'clipanion';

import { getCommandCwd, isInteractiveTty, type SinyukCliContext } from '../../../cli/context.js';
import { loadResolvedConfig } from '../../../platform/config/load-config.js';
import { createExecutionContext } from '../../../platform/execution-context.js';
import { CliError } from '../../../platform/errors.js';
import { createShutdownController } from '../../../platform/shutdown/controller.js';
import { runCropInteractiveScreen } from './screen.js';

const CROP_TTY_HINT = 'Crop currently requires an interactive TTY.';

/**
 * CLI command for `sinyuk-cli lora-dataset crop`.
 *
 * INTENT: Enter the interactive crop planner with an optional pre-filled dataset path
 * INPUT: optional --path flag and CLI context
 * OUTPUT: Promise<number> exit code
 * SIDE EFFECT: Loads config, creates execution context for the UI, and launches the Ink planner screen
 * FAILURE: Throws CliError when a TTY is unavailable or the planner screen fails
 */
export class CropCommand extends Command<SinyukCliContext> {
	static override paths = [['lora-dataset', 'crop']];

	static override usage = Command.Usage({
		category: 'Features',
		description: 'Open the interactive lora-dataset crop planner',
		examples: [
			['Open interactive crop flow', '$0 lora-dataset crop'],
			['Open crop planner on a dataset', '$0 lora-dataset crop --path ./images'],
		],
	});

	readonly targetPath = Option.String('--path', { required: false });

	override async execute(): Promise<number> {
		const shutdown = createShutdownController();
		const cwd = getCommandCwd(this.context);

		try {
			const loaded = loadResolvedConfig({ cwd });
			const isTTY = isInteractiveTty(this.context);
			if (!isTTY) {
				throw new CliError(
					`${CROP_TTY_HINT} Re-run in a terminal${this.targetPath ? '' : ' and provide --path once the planner opens'}.`,
					'MISSING_TTY',
				);
			}

			return await runCropInteractiveScreen({
				entryMode: 'cli',
				configSnapshot: loaded.config,
				abortSignal: shutdown.signal,
				createExecutionContext: ({ entryMode, dryRun }) =>
					createExecutionContext({
						entryMode,
						configSnapshot: loaded.config,
						abortSignal: shutdown.signal,
						dryRun,
						isTTY,
					}),
				initialPath: this.targetPath,
			});
		} finally {
			shutdown.dispose();
		}
	}
}

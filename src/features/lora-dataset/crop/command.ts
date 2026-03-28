import { Command, Option } from 'clipanion';

import { getCommandCwd, isInteractiveTty, type SinyukCliContext } from '../../../cli/context.js';
import { loadResolvedConfig } from '../../../platform/config/load-config.js';
import { createExecutionContext } from '../../../platform/execution-context.js';
import { CliError } from '../../../platform/errors.js';
import { getInteractiveFallbackDecision } from '../../../platform/shutdown/fallback-policy.js';
import { createShutdownController } from '../../../platform/shutdown/controller.js';
import { runCropNonInteractive } from './run.js';
import { runCropInteractiveScreen } from './screen.js';

const CROP_REQUIRED_INPUT_HINT = '--path and --crop-profile';

/**
 * CLI command for `sinyuk-cli lora-dataset crop`.
 *
 * INTENT: Bridge CLI flags into the crop action's canonical runner or interactive fallback
 * INPUT: path/crop-profile flags and CLI context
 * OUTPUT: Promise<number> exit code
 * SIDE EFFECT: Loads config, creates execution context for fallback UI, and may launch Ink or non-interactive crop execution
 * FAILURE: Throws CliError when required inputs are missing and fallback is not allowed, or when the runner fails
 */
export class CropCommand extends Command<SinyukCliContext> {
	static override paths = [['lora-dataset', 'crop']];

	static override usage = Command.Usage({
		category: 'Features',
		description: 'Run lora-dataset crop batch',
		examples: [
			['Open interactive crop flow', '$0 lora-dataset crop'],
			['Run crop batch directly', '$0 lora-dataset crop --path ./images --crop-profile 1:1@1024'],
		],
	});

	readonly targetPath = Option.String('--path', { required: false });
	readonly cropProfile = Option.String('--crop-profile', { required: false });

	override async execute(): Promise<number> {
		const shutdown = createShutdownController();
		const cwd = getCommandCwd(this.context);

		try {
			const loaded = loadResolvedConfig({ cwd });
			const isTTY = isInteractiveTty(this.context);

			if (!this.targetPath || !this.cropProfile) {
				const fallbackDecision = getInteractiveFallbackDecision({
					hasMissingRequiredInput: true,
					isTTY,
					envSnapshot: this.context.env,
					requiredInputHint: CROP_REQUIRED_INPUT_HINT,
				});

				if (!fallbackDecision.allowed) {
					throw new CliError(
						fallbackDecision.reason ?? `Missing required inputs. Provide ${CROP_REQUIRED_INPUT_HINT}.`,
						'MISSING_INPUT',
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
			}

			return await runCropNonInteractive({
				path: this.targetPath,
				cropProfileId: this.cropProfile,
				configSnapshot: loaded.config,
				abortSignal: shutdown.signal,
				stdout: this.context.stdout,
			});
		} finally {
			shutdown.dispose();
		}
	}
}

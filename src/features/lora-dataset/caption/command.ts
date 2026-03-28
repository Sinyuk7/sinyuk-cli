import { Command, Option } from 'clipanion';

import { getCommandCwd, isInteractiveTty, type SinyukCliContext } from '../../../cli/context.js';
import { loadResolvedConfig } from '../../../platform/config/load-config.js';
import { createExecutionContext } from '../../../platform/execution-context.js';
import { CliError } from '../../../platform/errors.js';
import { getInteractiveFallbackDecision } from '../../../platform/shutdown/fallback-policy.js';
import { createShutdownController } from '../../../platform/shutdown/controller.js';
import { runCaptionNonInteractive } from './run.js';
import { runCaptionInteractiveScreen } from './screen.js';

const CAPTION_REQUIRED_INPUT_HINT = '--path';

/**
 * CLI command for `sinyuk-cli lora-dataset caption`.
 *
 * INTENT: Bridge CLI flags into the caption action's canonical runner or interactive fallback
 * INPUT: path/full/preview/concurrency flags and CLI context
 * OUTPUT: Promise<number> exit code
 * SIDE EFFECT: Loads config, creates execution context, and may launch Ink or non-interactive caption execution
 * FAILURE: Throws CliError when required inputs are missing and fallback is not allowed, or when the runner fails
 */
export class CaptionCommand extends Command<SinyukCliContext> {
	static override paths = [['lora-dataset', 'caption']];

	static override usage = Command.Usage({
		category: 'Features',
		description: 'Run lora-dataset caption preview or full batch',
		examples: [
			['Preview one image from a dataset', '$0 lora-dataset caption --path ./images'],
			['Run full caption batch', '$0 lora-dataset caption --path ./images --full --confirm-full'],
		],
	});

	readonly targetPath = Option.String('--path', { required: false });
	readonly full = Option.Boolean('--full', false);
	readonly previewFile = Option.String('--preview-file', { required: false });
	readonly concurrency = Option.String('--concurrency', { required: false });
	readonly confirmFull = Option.Boolean('--confirm-full', false);

	override async execute(): Promise<number> {
		const shutdown = createShutdownController();
		const cwd = getCommandCwd(this.context);

		try {
			const loaded = loadResolvedConfig({ cwd });
			const isTTY = isInteractiveTty(this.context);

			if (!this.targetPath) {
				const fallbackDecision = getInteractiveFallbackDecision({
					hasMissingRequiredInput: true,
					isTTY,
					envSnapshot: this.context.env,
					requiredInputHint: CAPTION_REQUIRED_INPUT_HINT,
				});

				if (!fallbackDecision.allowed) {
					throw new CliError(
						fallbackDecision.reason ?? `Missing required inputs. Provide ${CAPTION_REQUIRED_INPUT_HINT}.`,
						'MISSING_INPUT',
					);
				}

				return await runCaptionInteractiveScreen({
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
				});
			}

			const concurrencyOverride = this.concurrency ? Number(this.concurrency) : null;
			if (
				this.concurrency &&
				(!Number.isInteger(concurrencyOverride) || (concurrencyOverride as number) <= 0)
			) {
				throw new CliError('--concurrency must be a positive integer.', 'INVALID_OPTION');
			}

			return await runCaptionNonInteractive({
				path: this.targetPath,
				mode: this.full ? 'full' : 'preview',
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
				previewFile: this.previewFile ?? null,
				concurrencyOverride,
				confirmFull: this.confirmFull,
				stdout: this.context.stdout,
			});
		} finally {
			shutdown.dispose();
		}
	}
}

import { Command, Option } from 'clipanion';

import { getCommandCwd, isInteractiveTty, type SinyukCliContext } from '../../cli/context.js';
import { loadResolvedConfig } from '../../platform/config/load-config.js';
import { createExecutionContext } from '../../platform/execution-context.js';
import { CliError } from '../../platform/errors.js';
import { getInteractiveFallbackDecision } from '../../platform/shutdown/fallback-policy.js';
import { createShutdownController } from '../../platform/shutdown/controller.js';
import { runHelloWorldPipeline, scanHelloWorldFiles } from './run.js';
import { getHelloWorldFeatureConfig } from './schema.js';
import { runHelloWorldInteractiveScreen } from './screen.js';

function printResult(
	context: SinyukCliContext,
	result: Awaited<ReturnType<typeof runHelloWorldPipeline>>,
): void {
	context.stdout.write(
		`Processed ${result.processed.length} files${result.failed.length > 0 ? `, failed ${result.failed.length}` : ''}.\n`,
	);
}

export class HelloWorldRunCommand extends Command<SinyukCliContext> {
	static override paths = [['hello-world', 'run']];

	static override usage = Command.Usage({
		category: 'Features',
		description: 'Run hello-world pipeline',
		examples: [
			['Run all files under path', '$0 hello-world run --path . --all'],
			['Run selected files', '$0 hello-world run --path . --file src/index.ts --file README.md'],
		],
	});

	readonly targetPath = Option.String('--path', { required: false });
	readonly all = Option.Boolean('--all', false);
	readonly file = Option.Array('--file');
	readonly dryRun = Option.Boolean('--dry-run', false);

	override async execute(): Promise<number> {
		const shutdown = createShutdownController();
		const cwd = getCommandCwd(this.context);

		try {
			const loaded = loadResolvedConfig({ cwd });
			const featureConfig = getHelloWorldFeatureConfig(loaded.config);
			const selectedFromFlags = this.file ?? [];
			const hasMissingInput = !this.targetPath || (!this.all && selectedFromFlags.length === 0);
			const isTTY = isInteractiveTty(this.context);

			if (hasMissingInput) {
				const fallbackDecision = getInteractiveFallbackDecision({
					hasMissingRequiredInput: hasMissingInput,
					isTTY,
					envSnapshot: this.context.env,
					requiredInputHint: '--path and (--all or --file)',
				});

				if (!fallbackDecision.allowed) {
					throw new CliError(
						fallbackDecision.reason ?? 'Missing required inputs.',
						'MISSING_INPUT',
					);
				}

				await runHelloWorldInteractiveScreen({
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
				return 0;
			}

		const scan = await scanHelloWorldFiles({
			basePath: this.targetPath,
				featureConfig,
				abortSignal: shutdown.signal,
			});

			const selectedFiles = this.all ? scan.files : selectedFromFlags;
			if (selectedFiles.length === 0) {
				throw new CliError('No files selected to run.', 'MISSING_SELECTION');
			}

			const missingFiles = selectedFiles.filter((file) => !scan.files.includes(file));
			if (missingFiles.length > 0) {
				throw new CliError(
					`Selected files are not found under path: ${missingFiles.join(', ')}`,
					'INVALID_SELECTION',
				);
			}

			const executionContext = createExecutionContext({
				entryMode: 'cli',
				configSnapshot: loaded.config,
				abortSignal: shutdown.signal,
				dryRun: this.dryRun,
				isTTY,
			});

			const result = await runHelloWorldPipeline(
				{
					basePath: scan.basePath,
					selectedFiles,
				},
				executionContext,
				(progress) => {
					this.context.stdout.write(
						`[${progress.current}/${progress.total}] ${progress.file}${executionContext.dryRun ? ' (dry-run)' : ''}\n`,
					);
				},
			);

			printResult(this.context, result);
			return result.failed.length > 0 ? 2 : 0;
		} finally {
			shutdown.dispose();
		}
	}
}

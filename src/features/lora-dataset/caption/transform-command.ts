import { Command, Option } from 'clipanion';

import type { SinyukCliContext } from '../../../cli/context.js';
import { CliError } from '../../../platform/errors.js';
import { discoverLoraImages } from '../shared/artifacts.js';
import {
	runCaptionTransform,
	type CaptionTriggerMode,
	type MissingPlaceholderPolicy,
} from './transform.js';

const TRIGGER_MODES: CaptionTriggerMode[] = ['prefix', 'suffix', 'replace-placeholder'];
const MISSING_PLACEHOLDER_POLICIES: MissingPlaceholderPolicy[] = [
	'fail',
	'prefix',
	'suffix',
	'skip',
];

function parseTriggerMode(value: string): CaptionTriggerMode {
	if ((TRIGGER_MODES as string[]).includes(value)) {
		return value as CaptionTriggerMode;
	}

	throw new CliError(
		`Invalid --mode "${value}". Use one of: ${TRIGGER_MODES.join(', ')}.`,
		'INVALID_OPTION',
	);
}

function parseMissingPlaceholderPolicy(value: string): MissingPlaceholderPolicy {
	if ((MISSING_PLACEHOLDER_POLICIES as string[]).includes(value)) {
		return value as MissingPlaceholderPolicy;
	}

	throw new CliError(
		`Invalid --on-missing-placeholder "${value}". Use one of: ${MISSING_PLACEHOLDER_POLICIES.join(', ')}.`,
		'INVALID_OPTION',
	);
}

/**
 * CLI command for `sinyuk-cli lora-dataset caption transform`.
 *
 * INTENT: Post-process existing caption .txt files with trigger insertion strategies without rerunning provider requests
 * INPUT: --path, --trigger, --mode, --separator, --placeholder, --on-missing-placeholder, --dry-run
 * OUTPUT: Promise<number> exit code (0 = success, 2 = partial failure)
 * SIDE EFFECT: Reads dataset captions and rewrites matching .txt files unless --dry-run is enabled
 * FAILURE: Throws CliError for invalid options or missing inputs
 */
export class CaptionTransformCommand extends Command<SinyukCliContext> {
	static override paths = [['lora-dataset', 'caption', 'transform']];

	static override usage = Command.Usage({
		category: 'Features',
		description: 'Apply trigger-word transforms to existing caption .txt files',
		examples: [
			[
				'Prepend trigger word to all existing captions',
				'$0 lora-dataset caption transform --path ./images --trigger body_lora --mode prefix',
			],
			[
				'Replace [trigger] placeholder in existing captions',
				'$0 lora-dataset caption transform --path ./images --trigger body_lora --mode replace-placeholder',
			],
		],
	});

	readonly targetPath = Option.String('--path', { required: true });
	readonly trigger = Option.String('--trigger', { required: true });
	readonly mode = Option.String('--mode', 'prefix');
	readonly separator = Option.String('--separator', ', ');
	readonly placeholder = Option.String('--placeholder', '[trigger]');
	readonly onMissingPlaceholder = Option.String('--on-missing-placeholder', 'fail');
	readonly dryRun = Option.Boolean('--dry-run', false);

	override async execute(): Promise<number> {
		const mode = parseTriggerMode(this.mode);
		const trigger = this.trigger.trim();
		const separator = this.separator;
		const placeholder = this.placeholder.trim();
		const missingPlaceholderPolicy = parseMissingPlaceholderPolicy(this.onMissingPlaceholder);

		if (trigger.length === 0) {
			throw new CliError('--trigger cannot be empty.', 'INVALID_OPTION');
		}

		if (mode === 'replace-placeholder' && placeholder.length === 0) {
			throw new CliError('--placeholder cannot be empty in replace-placeholder mode.', 'INVALID_OPTION');
		}

		const scanResult = await discoverLoraImages(this.targetPath);
		if (scanResult.images.length === 0) {
			throw new CliError(`No supported images found in ${scanResult.basePath}.`, 'NO_IMAGES_FOUND');
		}

		const result = await runCaptionTransform({
			scanResult,
			trigger,
			mode,
			separator,
			placeholder,
			onMissingPlaceholder: missingPlaceholderPolicy,
			dryRun: this.dryRun,
		});

		this.context.stdout.write(`Result: Scanned ${result.totalImages} images in ${scanResult.basePath}.\n`);
		this.context.stdout.write(
			`${this.dryRun ? 'Dry-run' : 'Transform'}: captions=${result.captionsFound}, updated=${result.updated}, unchanged=${result.unchanged}, missing=${result.missingCaption}, failed=${result.failed.length}.\n`,
		);

		for (const failedItem of result.failed) {
			this.context.stdout.write(`Failed: ${failedItem.key} -> ${failedItem.reason}\n`);
		}

		return result.failed.length > 0 ? 2 : 0;
	}
}

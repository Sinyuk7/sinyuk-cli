import type { Writable } from 'node:stream';

import type { FeatureScreenProps } from '../../../shared/feature-screen.js';
import { LoraDatasetBootstrapPauseError } from '../shared/bootstrap.js';
import { ProviderFatalError } from '../shared/provider.js';
import { loadScanContext, runBatch, runPreview } from '../shared/pipeline.js';
import { getLoraDatasetFeatureConfig } from '../shared/schema.js';

/**
 * Canonical non-interactive CLI runner for the caption Action.
 *
 * INTENT: Single execution path shared by CLI command — preview or full batch
 * INPUT: path, mode, configSnapshot, abortSignal, createExecutionContext, previewFile, concurrencyOverride, confirmFull, stdout
 * OUTPUT: Promise<number> exit code (0 = success, 2 = partial failure)
 * SIDE EFFECT: Scan files, call provider, write caption artifacts, stream progress to stdout
 * FAILURE: Throw when confirmation missing or pipeline step fails
 */
export async function runCaptionNonInteractive(options: {
	path: string;
	mode: 'preview' | 'full';
	configSnapshot: FeatureScreenProps['configSnapshot'];
	abortSignal: AbortSignal;
	createExecutionContext: FeatureScreenProps['createExecutionContext'];
	previewFile?: string | null;
	concurrencyOverride?: number | null;
	confirmFull: boolean;
	stdout: Writable;
}): Promise<number> {
	const config = getLoraDatasetFeatureConfig(options.configSnapshot);
	let loaded;
	try {
		loaded = await loadScanContext({ pathInput: options.path });
	} catch (error) {
		if (error instanceof LoraDatasetBootstrapPauseError) {
			for (const line of error.messageLines) {
				options.stdout.write(`${line}\n`);
			}
			return 1;
		}

		throw error;
	}

	options.stdout.write(`Scanned ${loaded.scanResult.images.length} images.\n`);
	options.stdout.write(`${loaded.promptPreviewLines.join('\n')}\n`);

	if (options.mode === 'preview') {
		const preview = await runPreview({
			scanResult: loaded.scanResult,
			config,
			workspace: loaded.workspace,
			executionContext: options.createExecutionContext({ entryMode: 'cli', dryRun: false }),
			previewFile: options.previewFile ?? null,
		});
		options.stdout.write(`Preview file: ${preview.relativePath}\n${preview.caption}\n`);
		return 0;
	}

	if (!options.confirmFull) {
		throw new ProviderFatalError('Full batch requires --confirm-full in non-interactive mode.');
	}

	const batch = await runBatch({
		scanResult: loaded.scanResult,
		config,
		workspace: loaded.workspace,
		executionContext: options.createExecutionContext({ entryMode: 'cli', dryRun: false }),
		concurrencyOverride: options.concurrencyOverride ?? null,
		onProgress: (progress) => {
			options.stdout.write(
				`[${progress.completed}/${progress.total}] failed=${progress.failed} active=${progress.activeWorkers.length}\n`,
			);
		},
	});

	return batch.failed.length > 0 ? 2 : 0;
}

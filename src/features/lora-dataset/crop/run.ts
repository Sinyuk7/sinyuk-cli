import type { Writable } from 'node:stream';

import type { FeatureScreenProps } from '../../../shared/feature-screen.js';
import { LoraDatasetBootstrapPauseError } from '../shared/bootstrap.js';
import { writeRunSummary } from '../shared/artifacts.js';
import { loadScanContext, runCrop } from '../shared/pipeline.js';
import { formatCropProfileId, getLoraDatasetFeatureConfig } from '../shared/schema.js';

/**
 * Canonical non-interactive CLI runner for the crop Action.
 *
 * INTENT: Single execution path for CLI crop command
 * INPUT: path, cropProfileId, configSnapshot, abortSignal, stdout
 * OUTPUT: Promise<number> exit code (0 = success, 2 = partial failure)
 * SIDE EFFECT: Scan files, crop images, write summary, stream progress to stdout
 * FAILURE: Throw when crop profile is missing/invalid or pipeline step fails
 */
export async function runCropNonInteractive(options: {
	path: string;
	cropProfileId: string;
	configSnapshot: FeatureScreenProps['configSnapshot'];
	abortSignal: AbortSignal;
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

	const profile = config.cropProfiles.find(
		(p) => formatCropProfileId(p) === options.cropProfileId,
	);
	if (!profile) {
		throw new Error(
			`Crop profile "${options.cropProfileId}" not found. Available: ${config.cropProfiles.map(formatCropProfileId).join(', ')}`,
		);
	}

	const cropResult = await runCrop({
		scanResult: loaded.scanResult,
		profile,
		abortSignal: options.abortSignal,
		onProgress: (progress) => {
			options.stdout.write(
				`[crop ${progress.current}/${progress.total}] ${progress.file}\n`,
			);
		},
	});

	await writeRunSummary(loaded.workspace.datasetPath, {
		phase: 'completed',
		crop: cropResult,
	});

	return cropResult.failed.length > 0 ? 2 : 0;
}

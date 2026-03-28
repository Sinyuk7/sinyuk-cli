import sharp from 'sharp';

import {
	buildCropOutputDirectory,
	discoverLoraImages,
	type LoraScanResult,
} from './artifacts.js';
import { deriveCropTargetSize, parseCropRatioValue } from './schema.js';
import type { CropRatioStat, CropSpec } from './types.js';

function findClosestRatio(actualRatio: number, ratioOptions: string[]): string {
	let closestRatio = ratioOptions[0] ?? '1:1';
	let closestDelta = Number.POSITIVE_INFINITY;

	for (const ratio of ratioOptions) {
		const delta = Math.abs(actualRatio - parseCropRatioValue(ratio));
		if (delta < closestDelta) {
			closestDelta = delta;
			closestRatio = ratio;
		}
	}

	return closestRatio;
}

/**
"""Build a deterministic crop spec from one ratio and selected long edge.

INTENT: Convert interactive crop choices into an execution-ready spec shared by UI and runner code
INPUT: basePath, ratio, longEdge
OUTPUT: CropSpec
SIDE EFFECT: None
FAILURE: Throw Error when ratio is invalid
"""
 */
export function buildCropSpec(options: {
	basePath: string;
	ratio: string;
	longEdge: number;
}): CropSpec {
	const size = deriveCropTargetSize({
		ratio: options.ratio,
		longEdge: options.longEdge,
	});

	return {
		ratio: options.ratio,
		longEdge: options.longEdge,
		width: size.width,
		height: size.height,
		outputDir: buildCropOutputDirectory(options.basePath, {
			ratio: options.ratio,
			longEdge: options.longEdge,
		}),
	};
}

/**
"""Build the full ordered crop plan for the current interactive selection.

INTENT: Materialize the user's ratio and resolution choices into the exact spec list that will be executed
INPUT: basePath, selectedRatios, resolutionByRatio
OUTPUT: ordered CropSpec[]
SIDE EFFECT: None
FAILURE: Throw Error when any selected ratio is missing a resolution
"""
 */
export function buildCropPlan(options: {
	basePath: string;
	selectedRatios: string[];
	resolutionByRatio: Record<string, number>;
}): CropSpec[] {
	return options.selectedRatios.map((ratio) => {
		const longEdge = options.resolutionByRatio[ratio];
		if (!longEdge) {
			throw new Error(`Missing resolution for ratio "${ratio}".`);
		}

		return buildCropSpec({
			basePath: options.basePath,
			ratio,
			longEdge,
		});
	});
}

/**
"""Count how many discovered images map to each configured crop ratio bucket.

INTENT: Show users a stable ratio distribution preview before they choose which crop specs to execute
INPUT: scanResult, ratioOptions
OUTPUT: CropRatioStat[] in config order
SIDE EFFECT: Reads image metadata from disk
FAILURE: Throw Error when image metadata cannot be read
"""
 */
export async function buildCropRatioStats(
	scanResult: LoraScanResult,
	ratioOptions: string[],
): Promise<CropRatioStat[]> {
	const counts = new Map<string, number>();
	for (const ratio of ratioOptions) {
		counts.set(ratio, 0);
	}

	for (const image of scanResult.images) {
		const metadata = await sharp(image.absolutePath).metadata();
		if (!metadata.width || !metadata.height) {
			throw new Error(`Failed to read image size for ${image.relativePath}.`);
		}

		const matchedRatio = findClosestRatio(
			metadata.width / metadata.height,
			ratioOptions,
		);
		counts.set(matchedRatio, (counts.get(matchedRatio) ?? 0) + 1);
	}

	return ratioOptions.map((ratio) => ({
		ratio,
		count: counts.get(ratio) ?? 0,
	}));
}

/**
"""Discover crop source images and compute their configured ratio distribution.

INTENT: Provide a pure crop planning scan path that does not trigger caption bootstrap or prompt loading
INPUT: pathInput, ratioOptions
OUTPUT: { scanResult, ratioStats }
SIDE EFFECT: Reads the filesystem and image metadata
FAILURE: Propagate scan or metadata errors
"""
 */
export async function loadCropScanContext(options: {
	pathInput: string;
	ratioOptions: string[];
}): Promise<{
	scanResult: LoraScanResult;
	ratioStats: CropRatioStat[];
}> {
	const scanResult = await discoverLoraImages(options.pathInput);
	const ratioStats = await buildCropRatioStats(scanResult, options.ratioOptions);
	return { scanResult, ratioStats };
}

import { readFile, writeFile } from 'node:fs/promises';

import type { LoraScanResult } from '../shared/artifacts.js';
import { isValidTextArtifact } from '../shared/artifacts.js';

export type CaptionTriggerMode = 'prefix' | 'suffix' | 'replace-placeholder';
export type MissingPlaceholderPolicy = 'fail' | 'prefix' | 'suffix' | 'skip';

export type CaptionTransformFailure = {
	key: string;
	reason: string;
};

export type CaptionTransformResult = {
	totalImages: number;
	captionsFound: number;
	updated: number;
	unchanged: number;
	missingCaption: number;
	failed: CaptionTransformFailure[];
};

function addPrefix(caption: string, trigger: string, separator: string): string {
	if (caption === trigger || caption.startsWith(`${trigger}${separator}`)) {
		return caption;
	}

	if (caption.length === 0) {
		return trigger;
	}

	return `${trigger}${separator}${caption}`;
}

function addSuffix(caption: string, trigger: string, separator: string): string {
	if (caption === trigger || caption.endsWith(`${separator}${trigger}`)) {
		return caption;
	}

	if (caption.length === 0) {
		return trigger;
	}

	return `${caption}${separator}${trigger}`;
}

/**
"""Apply a trigger-word transformation to one caption text.

INTENT: Keep trigger insertion deterministic across prefix/suffix/placeholder workflows while preventing accidental duplicates
INPUT: caption, trigger, mode, separator, placeholder, onMissingPlaceholder
OUTPUT: { caption, changed }
SIDE EFFECT: None
FAILURE: Throw Error when placeholder mode is selected and the placeholder is missing under fail policy
"""
 */
export function applyCaptionTriggerTransform(options: {
	caption: string;
	trigger: string;
	mode: CaptionTriggerMode;
	separator: string;
	placeholder: string;
	onMissingPlaceholder: MissingPlaceholderPolicy;
}): {
	caption: string;
	changed: boolean;
} {
	const normalized = options.caption.trim();
	let nextCaption = normalized;

	if (options.mode === 'prefix') {
		nextCaption = addPrefix(normalized, options.trigger, options.separator);
		return { caption: nextCaption, changed: nextCaption !== normalized };
	}

	if (options.mode === 'suffix') {
		nextCaption = addSuffix(normalized, options.trigger, options.separator);
		return { caption: nextCaption, changed: nextCaption !== normalized };
	}

	if (normalized.includes(options.placeholder)) {
		nextCaption = normalized.split(options.placeholder).join(options.trigger);
		return { caption: nextCaption, changed: nextCaption !== normalized };
	}

	if (options.onMissingPlaceholder === 'prefix') {
		nextCaption = addPrefix(normalized, options.trigger, options.separator);
		return { caption: nextCaption, changed: nextCaption !== normalized };
	}

	if (options.onMissingPlaceholder === 'suffix') {
		nextCaption = addSuffix(normalized, options.trigger, options.separator);
		return { caption: nextCaption, changed: nextCaption !== normalized };
	}

	if (options.onMissingPlaceholder === 'skip') {
		return { caption: normalized, changed: false };
	}

	throw new Error(`Placeholder "${options.placeholder}" not found.`);
}

/**
"""Transform existing caption text files in-place for one scanned dataset.

INTENT: Provide a dedicated post-processing path for trigger-word insertion without re-running provider caption requests
INPUT: scanResult, trigger, mode, separator, placeholder, onMissingPlaceholder, dryRun
OUTPUT: CaptionTransformResult
SIDE EFFECT: Read and optionally rewrite caption .txt files next to source images
FAILURE: Collect per-file failures into result.failed without aborting the whole transform run
"""
 */
export async function runCaptionTransform(options: {
	scanResult: LoraScanResult;
	trigger: string;
	mode: CaptionTriggerMode;
	separator: string;
	placeholder: string;
	onMissingPlaceholder: MissingPlaceholderPolicy;
	dryRun: boolean;
}): Promise<CaptionTransformResult> {
	const result: CaptionTransformResult = {
		totalImages: options.scanResult.images.length,
		captionsFound: 0,
		updated: 0,
		unchanged: 0,
		missingCaption: 0,
		failed: [],
	};

	for (const image of options.scanResult.images) {
		if (!(await isValidTextArtifact(image.captionPath))) {
			result.missingCaption += 1;
			continue;
		}

		result.captionsFound += 1;

		try {
			const currentCaption = (await readFile(image.captionPath, 'utf8')).trim();
			const transformed = applyCaptionTriggerTransform({
				caption: currentCaption,
				trigger: options.trigger,
				mode: options.mode,
				separator: options.separator,
				placeholder: options.placeholder,
				onMissingPlaceholder: options.onMissingPlaceholder,
			});

			if (!transformed.changed) {
				result.unchanged += 1;
				continue;
			}

			if (!options.dryRun) {
				await writeFile(image.captionPath, `${transformed.caption}\n`, 'utf8');
			}
			result.updated += 1;
		} catch (error) {
			result.failed.push({
				key: image.relativePath,
				reason: (error as Error).message,
			});
		}
	}

	return result;
}

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PATHS = {
	featureConfig: 'feature-config.yaml.example',
	datasetConfig: 'dataset-config.yaml.example',
	userPrompt: 'user-prompt.txt.example',
} as const;

function resolveTemplatePath(relativePath: string): string {
	const candidates = [
		fileURLToPath(new URL(`../../../../templates/lora-dataset/${relativePath}`, import.meta.url)),
		fileURLToPath(new URL(`../templates/lora-dataset/${relativePath}`, import.meta.url)),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error(`Missing lora-dataset template file: ${relativePath}`);
}

/**
"""Read one bundled lora-dataset template file from the repository/package.

INTENT: Keep init/bootstrap template content physically versioned in the codebase instead of hardcoding strings
INPUT: template kind
OUTPUT: template text content
SIDE EFFECT: Read the filesystem
FAILURE: Throw Error when the bundled template file cannot be found or read
"""
 */
export function readLoraDatasetTemplate(kind: keyof typeof TEMPLATE_PATHS): string {
	return readFileSync(resolveTemplatePath(TEMPLATE_PATHS[kind]), 'utf8');
}

/**
"""Copy one bundled lora-dataset template file into a target path when missing.

INTENT: Materialize versioned example files onto the user's disk without injecting runtime defaults
INPUT: template kind, target path
OUTPUT: true when copied, false when target already exists
SIDE EFFECT: Create parent directories and copy a file on disk
FAILURE: Throw Error when the bundled template is missing or the copy fails
"""
 */
export function copyLoraDatasetTemplateIfMissing(
	kind: keyof typeof TEMPLATE_PATHS,
	targetPath: string,
): boolean {
	if (existsSync(targetPath)) {
		return false;
	}

	mkdirSync(dirname(targetPath), { recursive: true });
	copyFileSync(resolveTemplatePath(TEMPLATE_PATHS[kind]), targetPath);
	return true;
}

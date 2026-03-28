import { createHash } from 'node:crypto';
import {
	access,
	copyFile,
	mkdir,
	readFile,
	readdir,
	stat,
	writeFile,
} from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';

import sharp from 'sharp';

import type { LoraDatasetCropProfile } from './schema.js';
import {
	getLoraDatasetWorkspaceDirName,
	resolveLoraDatasetWorkspace,
} from './workspace.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const OUTPUT_JPEG_QUALITY = 95;
const OUTPUT_DIR_PREFIX = 'dataset-crop';

export type LoraImageItem = {
	absolutePath: string;
	relativePath: string;
	captionPath: string;
	rawResponsePath: string;
};

export type LoraScanResult = {
	basePath: string;
	images: LoraImageItem[];
	extensionCounts: Record<string, number>;
};

function isExcludedDirectory(name: string): boolean {
	return (
		name === '_meta' ||
		name === getLoraDatasetWorkspaceDirName() ||
		name.startsWith(OUTPUT_DIR_PREFIX)
	);
}

function toSafeResponseName(relativePath: string): string {
	return createHash('sha1').update(relativePath).digest('hex');
}

function parseRatio(ratio: string): number {
	const [widthText, heightText] = ratio.split(':');
	const width = Number(widthText);
	const height = Number(heightText);
	return width / height;
}

function deriveTargetSize(profile: LoraDatasetCropProfile): { width: number; height: number } {
	const ratioValue = parseRatio(profile.ratio);
	const widthFromLongEdge = Math.round(profile.longEdge * ratioValue);
	const heightFromLongEdge = Math.round(profile.longEdge / ratioValue);

	if (ratioValue >= 1) {
		return {
			width: profile.longEdge,
			height: Math.round(profile.longEdge / ratioValue),
		};
	}

	return {
		width: Math.round(profile.longEdge * ratioValue),
		height: profile.longEdge,
	};
}

async function discoverRecursive(options: {
	basePath: string;
	currentPath: string;
	rawDirPath: string;
	output: LoraImageItem[];
	extensionCounts: Record<string, number>;
}): Promise<void> {
	const entries = await readdir(options.currentPath, { withFileTypes: true });

	for (const entry of entries) {
		const absolutePath = join(options.currentPath, entry.name);
		if (entry.isDirectory()) {
			if (!isExcludedDirectory(entry.name)) {
				await discoverRecursive({
					...options,
					currentPath: absolutePath,
				});
			}
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		const extension = extname(entry.name).toLowerCase();
		if (!SUPPORTED_EXTENSIONS.has(extension)) {
			continue;
		}

		const relativePath = relative(options.basePath, absolutePath);
		options.extensionCounts[extension] = (options.extensionCounts[extension] ?? 0) + 1;
		options.output.push({
			absolutePath,
			relativePath,
			captionPath: absolutePath.replace(/\.[^.]+$/, '.txt'),
			rawResponsePath: join(options.rawDirPath, `${toSafeResponseName(relativePath)}.json`),
		});
	}
}

async function ensureDirectory(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
}

/**
"""Discover source images and derive all stable artifact paths for the current run.

INTENT: 扫描输入目录、过滤 feature 自己的输出目录，并产出后续 caption/crop 所需的稳定路径
INPUT: basePath
OUTPUT: LoraScanResult
SIDE EFFECT: 读取目录结构
FAILURE: 输入路径不存在或不是目录时抛出 Error
"""
 */
export async function discoverLoraImages(basePath: string): Promise<LoraScanResult> {
	const workspace = resolveLoraDatasetWorkspace(basePath);
	const absoluteBasePath = workspace.datasetPath;
	const metadata = await stat(absoluteBasePath);
	if (!metadata.isDirectory()) {
		throw new Error(`Path is not a directory: ${absoluteBasePath}`);
	}

	const images: LoraImageItem[] = [];
	const extensionCounts: Record<string, number> = {};
	await discoverRecursive({
		basePath: absoluteBasePath,
		currentPath: absoluteBasePath,
		rawDirPath: workspace.rawDirPath,
		output: images,
		extensionCounts,
	});

	images.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
	return {
		basePath: absoluteBasePath,
		images,
		extensionCounts,
	};
}

export async function isValidTextArtifact(path: string): Promise<boolean> {
	try {
		const content = (await readFile(path, 'utf8')).trim();
		return content.length > 0;
	} catch {
		return false;
	}
}

export async function writeCaptionArtifacts(options: {
	image: LoraImageItem;
	caption: string;
	rawResponse: unknown;
}): Promise<void> {
	await ensureDirectory(dirname(options.image.rawResponsePath));
	await writeFile(options.image.captionPath, `${options.caption}\n`, 'utf8');
	await writeFile(options.image.rawResponsePath, JSON.stringify(options.rawResponse, null, 2), 'utf8');
}

export function getPromptSummaryPath(basePath: string): string {
	return resolveLoraDatasetWorkspace(basePath).runSummaryPath;
}

export function getFailedItemsPath(basePath: string): string {
	return resolveLoraDatasetWorkspace(basePath).failedItemsPath;
}

export async function writeRunSummary(basePath: string, summary: Record<string, unknown>): Promise<void> {
	const path = getPromptSummaryPath(basePath);
	await ensureDirectory(dirname(path));
	await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

export async function writeFailedItems(basePath: string, failedLines: string[]): Promise<void> {
	const path = getFailedItemsPath(basePath);
	await ensureDirectory(dirname(path));
	await writeFile(path, `${failedLines.join('\n')}${failedLines.length > 0 ? '\n' : ''}`, 'utf8');
}

export function buildCropOutputDirectory(
	basePath: string,
	profile: LoraDatasetCropProfile,
): string {
	const suffix = profile.ratio.replace(':', 'x');
	return join(basePath, `${OUTPUT_DIR_PREFIX}-${suffix}-${profile.longEdge}`);
}

export function buildCropOutputImagePath(outputDir: string, index: number): string {
	return join(outputDir, `image_${String(index).padStart(4, '0')}.jpg`);
}

export function buildCropOutputTextPath(outputDir: string, index: number): string {
	return join(outputDir, `image_${String(index).padStart(4, '0')}.txt`);
}

export async function cropImageToPath(options: {
	sourcePath: string;
	outputPath: string;
	profile: LoraDatasetCropProfile;
}): Promise<void> {
	const targetSize = deriveTargetSize(options.profile);
	await ensureDirectory(dirname(options.outputPath));
	await sharp(options.sourcePath)
		.rotate()
		.resize({
			width: targetSize.width,
			height: targetSize.height,
			fit: 'cover',
			position: 'centre',
		})
		.jpeg({ quality: OUTPUT_JPEG_QUALITY })
		.toFile(options.outputPath);
}

export async function copyCaptionIfPresent(options: {
	sourceCaptionPath: string;
	outputCaptionPath: string;
}): Promise<boolean> {
	if (!(await isValidTextArtifact(options.sourceCaptionPath))) {
		return false;
	}

	await ensureDirectory(dirname(options.outputCaptionPath));
	await copyFile(options.sourceCaptionPath, options.outputCaptionPath);
	return true;
}

export async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

import React, { useEffect, useRef } from 'react';
import { Box, Text, render } from 'ink';
import {
	ConfirmInput,
	MultiSelect,
	ProgressBar,
	Select,
	Spinner,
	StatusMessage,
	TextInput,
} from '@inkjs/ui';
import { useStore } from 'zustand';

import type { FeatureScreenProps } from '../../../shared/feature-screen.js';
import { createCropStore } from './store.js';

type CropScreenProps = FeatureScreenProps & {
	initialPath?: string;
	onExit: (exitCode?: number) => void;
};

type ScreenFrameProps = {
	breadcrumb: string;
	children: React.ReactNode;
	hint?: string;
};

const CROP_BREADCRUMB = 'lora-dataset › crop';
const RATIO_BREADCRUMB = 'lora-dataset › crop › ratios';
const RESOLUTION_BREADCRUMB = 'lora-dataset › crop › resolution';

function ScreenFrame(props: ScreenFrameProps): React.JSX.Element {
	return (
		<Box flexDirection="column" gap={1}>
			<Text color="blueBright">{props.breadcrumb}</Text>
			{props.children}
			{props.hint ? <Text dimColor>{props.hint}</Text> : null}
		</Box>
	);
}

/**
 * Crop Action screen - Activity root that renders sub-views by store.step.
 *
 * INTENT: Thin UI adapter driven entirely by crop planner store state
 * INPUT: FeatureScreenProps
 * OUTPUT: React element tree
 * SIDE EFFECT: Creates crop store on mount; store actions perform I/O
 * FAILURE: Store transitions to 'error' step; UI shows error message + retry
 */
export function CropScreen(props: CropScreenProps): React.JSX.Element {
	const initialScanRequestedRef = useRef(false);
	const storeRef = useRef(
		createCropStore({
			configSnapshot: props.configSnapshot,
			abortSignal: props.abortSignal,
			initialPath: props.initialPath,
		}),
	);
	const store = storeRef.current;

	const step = useStore(store, (s) => s.step);
	const pathInput = useStore(store, (s) => s.pathInput);
	const scanResult = useStore(store, (s) => s.scanResult);
	const ratioStats = useStore(store, (s) => s.ratioStats);
	const availableResolutions = useStore(store, (s) => s.availableResolutions);
	const selectedRatios = useStore(store, (s) => s.selectedRatios);
	const resolutionByRatio = useStore(store, (s) => s.resolutionByRatio);
	const resolutionCursor = useStore(store, (s) => s.resolutionCursor);
	const cropPlan = useStore(store, (s) => s.cropPlan);
	const runResult = useStore(store, (s) => s.runResult);
	const currentSpecProgress = useStore(store, (s) => s.currentSpecProgress);
	const currentImageProgress = useStore(store, (s) => s.currentImageProgress);
	const errorMessage = useStore(store, (s) => s.errorMessage);
	const actions = useStore(store, (s) => s.actions);

	useEffect(() => {
		if (!props.initialPath || initialScanRequestedRef.current) {
			return;
		}

		if (step === 'input' && scanResult === null) {
			initialScanRequestedRef.current = true;
			void actions.startScan(props.initialPath);
		}
	}, [actions, props.initialPath, scanResult, step]);

	if (step === 'input') {
		return (
			<ScreenFrame breadcrumb={CROP_BREADCRUMB}>
				<Text>Enter dataset path:</Text>
				<TextInput
					defaultValue={pathInput}
					onChange={actions.setPathInput}
					onSubmit={(value) => {
						actions.setPathInput(value);
						void actions.startScan(value);
					}}
				/>
			</ScreenFrame>
		);
	}

	if (step === 'empty') {
		return (
			<ScreenFrame breadcrumb={CROP_BREADCRUMB}>
				<StatusMessage variant="info">
					No supported images found in {scanResult?.basePath ?? pathInput}
				</StatusMessage>
				<Text>Change path? [Y/n]</Text>
				<ConfirmInput onConfirm={() => actions.returnToInput()} onCancel={props.onExit} />
			</ScreenFrame>
		);
	}

	if (step === 'scanning') {
		return (
			<ScreenFrame breadcrumb={CROP_BREADCRUMB}>
				<Spinner label={`Scanning ${pathInput}...`} />
			</ScreenFrame>
		);
	}

	if (step === 'scan-preview' && scanResult) {
		const extensionSummary = Object.entries(scanResult.extensionCounts)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([extension, count]) => `${extension}: ${count}`)
			.join(', ');

		return (
			<ScreenFrame breadcrumb={CROP_BREADCRUMB}>
				<Text>Path: {scanResult.basePath}</Text>
				<Text>Images: {scanResult.images.length}</Text>
				<Text>Extensions: {extensionSummary || 'none'}</Text>
				<Text>Closest ratio distribution:</Text>
				{ratioStats.map((stat) => (
					<Text key={stat.ratio}>
						{'  '}
						{stat.ratio}: {stat.count}
					</Text>
				))}
				<Text>Continue to ratio selection? [Y/n]</Text>
				<ConfirmInput onConfirm={() => actions.openRatioSelection()} onCancel={props.onExit} />
			</ScreenFrame>
		);
	}

	if (step === 'ratio-select') {
		const options = ratioStats.map((stat) => ({
			label: `${stat.ratio} (${stat.count})`,
			value: stat.ratio,
		}));

		return (
			<ScreenFrame
				breadcrumb={RATIO_BREADCRUMB}
				hint="↑/↓ Navigate  Space Toggle  Enter Select  Ctrl+C Quit"
			>
				<Text>Select one or more ratios.</Text>
				<MultiSelect
					options={options}
					defaultValue={selectedRatios}
					onChange={(values) => actions.setSelectedRatios(values as string[])}
					onSubmit={(values) => {
						actions.setSelectedRatios(values as string[]);
						actions.openResolutionSelection();
					}}
				/>
				<Text>Selected: {selectedRatios.length}</Text>
			</ScreenFrame>
		);
	}

	if (step === 'resolution-select') {
		const currentRatio = selectedRatios[resolutionCursor];
		const currentResolution =
			(currentRatio && resolutionByRatio[currentRatio]) ?? availableResolutions[0] ?? 0;
		const resolutionOptions = availableResolutions.map((resolution) => ({
			value: String(resolution),
			label: `${resolution}px`,
		}));
		const chosenSummary = selectedRatios
			.map((ratio) => {
				const resolution = resolutionByRatio[ratio];
				return resolution ? `${ratio} -> ${resolution}px` : `${ratio} -> pending`;
			})
			.join(', ');

		return (
			<ScreenFrame
				breadcrumb={RESOLUTION_BREADCRUMB}
				hint="↑/↓ Navigate  Enter Select  Ctrl+C Quit"
			>
				<Text>
					Ratio {resolutionCursor + 1}/{selectedRatios.length}: {currentRatio}
				</Text>
				<Text>Choose the long-edge resolution for this ratio:</Text>
				<Select
					key={currentRatio}
					options={resolutionOptions}
					defaultValue={String(currentResolution)}
					onChange={(value) => actions.setCurrentResolution(Number(value as string))}
				/>
				<Text dimColor>Current plan: {chosenSummary}</Text>
				<Text>
					{resolutionCursor === selectedRatios.length - 1
						? 'Build crop spec summary? [Y/n]'
						: 'Confirm resolution and continue? [Y/n]'}
				</Text>
				<ConfirmInput
					onConfirm={() => actions.confirmResolutionSelection()}
					onCancel={props.onExit}
				/>
			</ScreenFrame>
		);
	}

	if (step === 'confirm' && scanResult) {
		return (
			<ScreenFrame breadcrumb={CROP_BREADCRUMB}>
				<Text>Dataset: {scanResult.basePath}</Text>
				<Text>Images: {scanResult.images.length}</Text>
				<Text>Specs:</Text>
				{cropPlan.map((spec) => (
					<Text key={`${spec.ratio}-${spec.longEdge}`}>
						{'  '}
						{spec.ratio} @ {spec.longEdge}px {'->'} {spec.width}x{spec.height} {'->'}{' '}
						{spec.outputDir}
					</Text>
				))}
				<Text>Run crop plan now? [Y/n]</Text>
				<ConfirmInput onConfirm={() => void actions.runPlan()} onCancel={props.onExit} />
			</ScreenFrame>
		);
	}

	if (step === 'running') {
		const percent =
			currentImageProgress && currentImageProgress.total > 0
				? Math.floor((currentImageProgress.current / currentImageProgress.total) * 100)
				: 0;

		return (
			<ScreenFrame breadcrumb={CROP_BREADCRUMB}>
				<Text>
					{currentSpecProgress
						? `Spec ${currentSpecProgress.current}/${currentSpecProgress.total}: ${currentSpecProgress.spec.ratio} @ ${currentSpecProgress.spec.longEdge}px`
						: 'Preparing crop plan...'}
				</Text>
				<ProgressBar value={percent} />
				<Text>
					{currentImageProgress
						? `[${currentImageProgress.current}/${currentImageProgress.total}] ${currentImageProgress.file}`
						: 'Starting crop...'}
				</Text>
			</ScreenFrame>
		);
	}

	if (step === 'done' && runResult) {
		return (
			<ScreenFrame breadcrumb={CROP_BREADCRUMB}>
				<StatusMessage variant={runResult.hasFailures ? 'warning' : 'success'}>
					Completed {runResult.totalSpecs} crop spec
					{runResult.totalSpecs === 1 ? '' : 's'}
					{runResult.hasFailures ? `, ${runResult.failedSpecs} with failures` : ' successfully'}.
				</StatusMessage>
				{runResult.specRuns.map((item) => (
					<Text key={`${item.spec.ratio}-${item.spec.longEdge}`} dimColor>
						{'  '}
						{item.spec.ratio} @ {item.spec.longEdge}px: cropped {item.result.cropped}, skipped{' '}
						{item.result.skippedExisting}, failed {item.result.failed.length}
					</Text>
				))}
				<Text>Exit? [Y/n]</Text>
				<ConfirmInput
					onConfirm={() => props.onExit(actions.complete())}
					onCancel={() => props.onExit(actions.complete())}
				/>
			</ScreenFrame>
		);
	}

	return (
		<ScreenFrame breadcrumb={CROP_BREADCRUMB}>
			<StatusMessage variant="error">{errorMessage ?? 'Unknown error.'}</StatusMessage>
			<Text>Retry? [Y/n]</Text>
			<ConfirmInput onConfirm={() => actions.retryFromError()} onCancel={props.onExit} />
		</ScreenFrame>
	);
}

/**
 * Run the crop Action as a standalone interactive Ink screen.
 *
 * INTENT: Reuse the same crop planner screen for CLI entry
 * INPUT: FeatureScreenProps plus optional initial path
 * OUTPUT: Promise<number> exit code
 * SIDE EFFECT: Mounts and unmounts an Ink app in the current process
 * FAILURE: Screen-level errors are handled inside the store and surfaced in UI state
 */
export async function runCropInteractiveScreen(
	props: Omit<CropScreenProps, 'onExit'>,
): Promise<number> {
	return await new Promise<number>((resolve) => {
		let unmounted = false;
		let exitCode = 0;
		const app = render(
			<CropScreen
				{...props}
				onExit={(nextExitCode: number = 0) => {
					exitCode = nextExitCode;
					if (!unmounted) {
						unmounted = true;
						app.unmount();
					}
				}}
			/>,
		);

		app.waitUntilExit().finally(() => resolve(exitCode));
	});
}

import React, { useEffect, useRef } from 'react';
import { Box, Text, render } from 'ink';
import {
	ConfirmInput,
	ProgressBar,
	Select,
	Spinner,
	StatusMessage,
	TextInput,
} from '@inkjs/ui';
import { useStore } from 'zustand';

import type { FeatureScreenProps } from '../../../shared/feature-screen.js';
import { RatioChecklist } from './ratio-checklist.js';
import { createCropStore } from './store.js';

type CropScreenProps = FeatureScreenProps & {
	initialPath?: string;
	onExit: (exitCode?: number) => void;
};

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
		if (props.initialPath && step === 'input' && scanResult === null) {
			void actions.startScan(props.initialPath);
		}
	}, [actions, props.initialPath, scanResult, step]);

	if (step === 'input') {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - crop planner</Text>
				<Text>Enter dataset path:</Text>
				<TextInput
					defaultValue={pathInput}
					onChange={actions.setPathInput}
					onSubmit={(value) => {
						actions.setPathInput(value);
						void actions.startScan(value);
					}}
				/>
			</Box>
		);
	}

	if (step === 'scanning') {
		return <Spinner label={`Scanning ${pathInput}...`} />;
	}

	if (step === 'scan-preview' && scanResult) {
		const extensionSummary = Object.entries(scanResult.extensionCounts)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([extension, count]) => `${extension}: ${count}`)
			.join(', ');

		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - crop - scan preview</Text>
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
				<ConfirmInput
					onConfirm={() => actions.openRatioSelection()}
					onCancel={props.onExit}
				/>
			</Box>
		);
	}

	if (step === 'ratio-select') {
		const options = ratioStats.map((stat) => ({
			ratio: stat.ratio,
			count: stat.count,
			selected: selectedRatios.includes(stat.ratio),
		}));

		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - crop - ratios</Text>
				<Text>Select one or more ratios.</Text>
				<Text dimColor>Use Up/Down to move, Space to toggle, Enter to continue.</Text>
				<RatioChecklist
					options={options}
					onToggle={actions.toggleRatio}
					onSubmit={actions.openResolutionSelection}
					onCancel={props.onExit}
				/>
				<Text>Selected: {selectedRatios.length}</Text>
			</Box>
		);
	}

	if (step === 'resolution-select') {
		const currentRatio = selectedRatios[resolutionCursor];
		const currentResolution =
			(currentRatio && resolutionByRatio[currentRatio]) ??
			availableResolutions[0] ??
			0;
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
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - crop - resolution</Text>
				<Text>
					Ratio {resolutionCursor + 1}/{selectedRatios.length}: {currentRatio}
				</Text>
				<Text>Choose the long-edge resolution for this ratio:</Text>
				<Select
					key={currentRatio}
					options={resolutionOptions}
					defaultValue={String(currentResolution)}
					onChange={(value) =>
						actions.setCurrentResolution(Number(value as string))
					}
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
			</Box>
		);
	}

	if (step === 'confirm' && scanResult) {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - crop - confirm</Text>
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
			</Box>
		);
	}

	if (step === 'running') {
		const percent =
			currentImageProgress && currentImageProgress.total > 0
				? Math.floor(
						(currentImageProgress.current / currentImageProgress.total) * 100,
					)
				: 0;

		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - crop - running</Text>
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
			</Box>
		);
	}

	if (step === 'done' && runResult) {
		return (
			<Box flexDirection="column" gap={1}>
				<StatusMessage variant={runResult.hasFailures ? 'warning' : 'success'}>
					Completed {runResult.totalSpecs} crop spec
					{runResult.totalSpecs === 1 ? '' : 's'}
					{runResult.hasFailures
						? `, ${runResult.failedSpecs} with failures`
						: ' successfully'}
					.
				</StatusMessage>
				{runResult.specRuns.map((item) => (
					<Text key={`${item.spec.ratio}-${item.spec.longEdge}`}>
						{'  '}
						{item.spec.ratio} @ {item.spec.longEdge}px: cropped {item.result.cropped},
						skipped {item.result.skippedExisting}, failed {item.result.failed.length}
					</Text>
				))}
				<Text>Exit? [Y/n]</Text>
				<ConfirmInput
					onConfirm={() => props.onExit(actions.complete())}
					onCancel={() => props.onExit(actions.complete())}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" gap={1}>
			<StatusMessage variant="error">{errorMessage ?? 'Unknown error.'}</StatusMessage>
			<Text>Retry? [Y/n]</Text>
			<ConfirmInput onConfirm={() => actions.retryFromError()} onCancel={props.onExit} />
		</Box>
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

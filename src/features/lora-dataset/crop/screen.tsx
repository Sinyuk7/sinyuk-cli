import React, { useEffect, useRef } from 'react';
import { Box, Text, render } from 'ink';
import { ConfirmInput, ProgressBar, Select, Spinner, StatusMessage, TextInput } from '@inkjs/ui';
import { useStore } from 'zustand';

import type { FeatureScreenProps } from '../../../shared/feature-screen.js';
import { formatCropProfileId } from '../shared/schema.js';
import { createCropStore } from './store.js';

type CropScreenProps = FeatureScreenProps & {
	initialPath?: string;
	onExit: (exitCode?: number) => void;
};

/**
 * Crop Action screen - Activity root that renders sub-views by store.step.
 *
 * INTENT: Thin UI adapter driven entirely by Zustand store state
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
	const cropProfiles = useStore(store, (s) => s.cropProfiles);
	const selectedProfileId = useStore(store, (s) => s.selectedProfileId);
	const cropResult = useStore(store, (s) => s.cropResult);
	const cropProgress = useStore(store, (s) => s.cropProgress);
	const pauseMessageLines = useStore(store, (s) => s.pauseMessageLines);
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
				<Text color="blueBright">lora-dataset - crop</Text>
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

	if (step === 'profile') {
		const profileOptions = cropProfiles.map((profile) => ({
			value: formatCropProfileId(profile),
			label: `${profile.ratio} @ ${profile.longEdge}px`,
		}));

		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - crop - profile</Text>
				<Text>Found {scanResult?.images.length ?? 0} images.</Text>
				<Text>Select crop profile:</Text>
				<Select
					options={profileOptions}
					defaultValue={selectedProfileId ?? undefined}
					onChange={(value) => actions.selectProfile(value)}
				/>
				<Text>Confirm and run crop? [Y/n]</Text>
				<ConfirmInput onConfirm={() => void actions.runCrop()} onCancel={props.onExit} />
			</Box>
		);
	}

	if (step === 'running') {
		const percent = cropProgress && cropProgress.total > 0 ? Math.floor((cropProgress.current / cropProgress.total) * 100) : 0;
		return (
			<Box flexDirection="column" gap={1}>
				<ProgressBar value={percent} />
				<Text>{cropProgress ? `[${cropProgress.current}/${cropProgress.total}] ${cropProgress.file}` : 'Starting crop...'}</Text>
			</Box>
		);
	}

	if (step === 'bootstrap-paused') {
		return (
			<Box flexDirection="column" gap={1}>
				<StatusMessage variant="warning">Execution paused.</StatusMessage>
				{pauseMessageLines.map((line, index) => (
					<Text key={index}>{line}</Text>
				))}
				<Text>Exit? [Y/n]</Text>
				<ConfirmInput
					onConfirm={() => props.onExit(actions.complete())}
					onCancel={() => props.onExit(actions.complete())}
				/>
			</Box>
		);
	}

	if (step === 'done' && cropResult) {
		const hasFailures = cropResult.failed.length > 0;
		return (
			<Box flexDirection="column" gap={1}>
				<StatusMessage variant={hasFailures ? 'warning' : 'success'}>
					Cropped {cropResult.cropped} images (skipped {cropResult.skippedExisting})
					{hasFailures ? `, ${cropResult.failed.length} failed` : ''}.
				</StatusMessage>
				<Text dimColor>Output: {cropResult.outputDir}</Text>
				<Text>Exit? [Y/n]</Text>
				<ConfirmInput
					onConfirm={() => {
						props.onExit(actions.complete());
					}}
					onCancel={() => {
						props.onExit(actions.complete());
					}}
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
 * INTENT: Reuse the same crop screen for CLI fallback when required inputs are missing
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
				onExit={(nextExitCode = 0) => {
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

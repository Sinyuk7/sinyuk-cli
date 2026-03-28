import React, { useEffect, useRef } from 'react';
import { Box, Text, render } from 'ink';
import { ConfirmInput, ProgressBar, Spinner, StatusMessage, TextInput } from '@inkjs/ui';
import { useStore } from 'zustand';

import type { FeatureScreenProps } from '../../../shared/feature-screen.js';
import { createCaptionStore } from './store.js';

type CaptionScreenProps = FeatureScreenProps & {
	initialPath?: string;
	previewFile?: string | null;
	concurrencyOverride?: number | null;
	onExit: (exitCode?: number) => void;
};

/**
 * Caption Action screen - Activity root that renders sub-views by store.step.
 *
 * INTENT: Thin UI adapter driven entirely by Zustand store state
 * INPUT: FeatureScreenProps
 * OUTPUT: React element tree
 * SIDE EFFECT: Creates caption store on mount; store actions perform I/O
 * FAILURE: Store transitions to 'error' step; UI shows error message + retry
 */
export function CaptionScreen(props: CaptionScreenProps): React.JSX.Element {
	const autoPreviewRequestedRef = useRef(false);
	const storeRef = useRef(
		createCaptionStore({
			configSnapshot: props.configSnapshot,
			abortSignal: props.abortSignal,
			entryMode: props.entryMode,
			createExecutionContext: props.createExecutionContext,
			initialPath: props.initialPath,
			previewFile: props.previewFile,
			concurrencyOverride: props.concurrencyOverride,
		}),
	);
	const store = storeRef.current;

	const step = useStore(store, (s) => s.step);
	const pathInput = useStore(store, (s) => s.pathInput);
	const promptPreviewLines = useStore(store, (s) => s.promptPreviewLines);
	const scanResult = useStore(store, (s) => s.scanResult);
	const previewResult = useStore(store, (s) => s.previewResult);
	const batchResult = useStore(store, (s) => s.batchResult);
	const progress = useStore(store, (s) => s.progress);
	const pauseMessageLines = useStore(store, (s) => s.pauseMessageLines);
	const errorMessage = useStore(store, (s) => s.errorMessage);
	const actions = useStore(store, (s) => s.actions);

	useEffect(() => {
		if (props.initialPath && step === 'input' && scanResult === null) {
			void actions.startScan(props.initialPath);
		}
	}, [actions, props.initialPath, scanResult, step]);

	useEffect(() => {
		if (step !== 'previewing' || !scanResult || previewResult) {
			autoPreviewRequestedRef.current = false;
			return;
		}

		if (!autoPreviewRequestedRef.current) {
			autoPreviewRequestedRef.current = true;
			void actions.runPreview();
		}
	}, [actions, previewResult, scanResult, step]);

	if (step === 'input') {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - caption</Text>
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

	if (step === 'previewing') {
		return <Spinner label="Running preview caption..." />;
	}

	if (step === 'preview-result' && previewResult) {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">lora-dataset - caption - preview</Text>
				{promptPreviewLines.length > 0 && (
					<Box flexDirection="column">
						<Text dimColor>Prompt preview:</Text>
						{promptPreviewLines.map((line, index) => (
							<Text key={index} dimColor>
								{'  '}
								{line}
							</Text>
						))}
					</Box>
				)}
				<Text>File: {previewResult.relativePath}</Text>
				<Text>Caption: {previewResult.caption}</Text>
				<Text>Run full batch on {scanResult?.images.length ?? 0} images? [Y/n]</Text>
				<ConfirmInput onConfirm={() => actions.openConfirm()} onCancel={props.onExit} />
			</Box>
		);
	}

	if (step === 'confirm') {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="yellowBright">
					Confirm: run caption on {scanResult?.images.length ?? 0} images?
				</Text>
				<Text>This will call the configured provider. [Y/n]</Text>
				<ConfirmInput onConfirm={() => void actions.runBatch()} onCancel={props.onExit} />
			</Box>
		);
	}

	if (step === 'running') {
		const percent = progress && progress.total > 0 ? Math.floor((progress.completed / progress.total) * 100) : 0;
		return (
			<Box flexDirection="column" gap={1}>
				<ProgressBar value={percent} />
				<Text>{progress ? `[${progress.completed}/${progress.total}] failed=${progress.failed}` : 'Starting...'}</Text>
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

	if (step === 'done' && batchResult) {
		const hasFailures = batchResult.failed.length > 0;
		return (
			<Box flexDirection="column" gap={1}>
				<StatusMessage variant={hasFailures ? 'warning' : 'success'}>
					Captioned {batchResult.total} images
					{hasFailures ? `, ${batchResult.failed.length} failed` : ''}.
				</StatusMessage>
				<Text dimColor>Summary: {batchResult.summaryPath}</Text>
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
 * Run the caption Action as a standalone interactive Ink screen.
 *
 * INTENT: Reuse the same caption screen for CLI fallback when required inputs are missing
 * INPUT: FeatureScreenProps plus optional initial path/preview settings
 * OUTPUT: Promise<number> exit code
 * SIDE EFFECT: Mounts and unmounts an Ink app in the current process
 * FAILURE: Screen-level errors are handled inside the store and surfaced in UI state
 */
export async function runCaptionInteractiveScreen(
	props: Omit<CaptionScreenProps, 'onExit'>,
): Promise<number> {
	return await new Promise<number>((resolve) => {
		let unmounted = false;
		let exitCode = 0;
		const app = render(
			<CaptionScreen
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

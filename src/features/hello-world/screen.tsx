import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
	ConfirmInput,
	MultiSelect,
	ProgressBar,
	Spinner,
	StatusMessage,
	TextInput,
} from '@inkjs/ui';

import type { FeatureScreenProps } from '../../shared/feature-screen.js';
import { getHelloWorldFeatureConfig } from './schema.js';
import { runHelloWorldPipeline, scanHelloWorldFiles, type HelloWorldRunResult } from './run.js';

type HelloWorldStage =
	| 'input'
	| 'scanning'
	| 'empty'
	| 'selecting'
	| 'running'
	| 'success'
	| 'error';

function useFeatureConfig(configSnapshot: FeatureScreenProps['configSnapshot']): {
	config: ReturnType<typeof getHelloWorldFeatureConfig> | null;
	errorMessage: string | null;
} {
	return useMemo(() => {
		try {
			return {
				config: getHelloWorldFeatureConfig(configSnapshot),
				errorMessage: null,
			};
		} catch (error) {
			return {
				config: null,
				errorMessage: (error as Error).message,
			};
		}
	}, [configSnapshot]);
}

export function HelloWorldScreen(props: FeatureScreenProps): React.JSX.Element {
	const { config, errorMessage: configError } = useFeatureConfig(props.configSnapshot);

	const [stage, setStage] = useState<HelloWorldStage>('input');
	const [pathInput, setPathInput] = useState(process.cwd());
	const [scannedFiles, setScannedFiles] = useState<string[]>([]);
	const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
	const [runResult, setRunResult] = useState<HelloWorldRunResult | null>(null);
	const [errorMessage, setErrorMessage] = useState<string>('');
	const [progress, setProgress] = useState({ current: 0, total: 0, file: '' });
	const [dryRun, setDryRun] = useState(false);

	useEffect(() => {
		if (stage !== 'scanning' || config === null) {
			return;
		}

		let active = true;
		scanHelloWorldFiles({
			basePath: pathInput,
			featureConfig: config,
			abortSignal: props.abortSignal,
		})
			.then((result) => {
				if (!active) {
					return;
				}

				setScannedFiles(result.files);
				setSelectedFiles(result.files);
				setStage(result.files.length === 0 ? 'empty' : 'selecting');
			})
			.catch((error) => {
				if (!active) {
					return;
				}

				setErrorMessage((error as Error).message);
				setStage('error');
			});

		return () => {
			active = false;
		};
	}, [config, pathInput, props.abortSignal, stage]);

	useEffect(() => {
		if (stage !== 'running') {
			return;
		}

		let active = true;
		const executionContext = props.createExecutionContext({
			entryMode: props.entryMode,
			dryRun,
		});

		runHelloWorldPipeline(
			{
				basePath: pathInput,
				selectedFiles,
			},
			executionContext,
			(next) => {
				if (active) {
					setProgress(next);
				}
			},
		)
			.then((result) => {
				if (!active) {
					return;
				}

				setRunResult(result);
				setStage('success');
			})
			.catch((error) => {
				if (!active) {
					return;
				}

				setErrorMessage((error as Error).message);
				setStage('error');
			});

		return () => {
			active = false;
		};
	}, [dryRun, pathInput, props.createExecutionContext, props.entryMode, selectedFiles, stage]);

	if (configError) {
		return (
			<Box flexDirection="column" gap={1}>
				<StatusMessage variant="error">{configError}</StatusMessage>
				<Text>Exit? [Y/n]</Text>
				<ConfirmInput onConfirm={props.onExit} onCancel={props.onExit} />
			</Box>
		);
	}

	if (stage === 'input') {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">hello-world › run</Text>
				<Text>Input path and press Enter:</Text>
				<TextInput
					defaultValue={pathInput}
					onChange={setPathInput}
					onSubmit={(value) => {
						setPathInput(value);
						setRunResult(null);
						setStage('scanning');
					}}
				/>
				<Text color={dryRun ? 'cyan' : 'gray'}>
					{dryRun ? 'Dry-run enabled.' : 'Execution mode enabled.'}
				</Text>
				<Text>Toggle dry-run? [Y/n]</Text>
				<ConfirmInput
					defaultChoice={dryRun ? 'confirm' : 'cancel'}
					onConfirm={() => setDryRun(true)}
					onCancel={() => setDryRun(false)}
				/>
			</Box>
		);
	}

	if (stage === 'scanning') {
		return <Spinner label={`Scanning ${pathInput}...`} />;
	}

	if (stage === 'empty') {
		return (
			<Box flexDirection="column" gap={1}>
				<StatusMessage variant="info">No files found in {pathInput}</StatusMessage>
				<Text>Change path? [Y/n]</Text>
				<ConfirmInput onConfirm={() => setStage('input')} onCancel={props.onExit} />
			</Box>
		);
	}

	if (stage === 'selecting') {
		return (
			<Box flexDirection="column" gap={1}>
				<Text>Select files (Space to toggle, Enter to confirm):</Text>
				<MultiSelect
					options={scannedFiles.map((file) => ({ label: file, value: file }))}
					defaultValue={selectedFiles}
					onChange={setSelectedFiles}
					onSubmit={(values) => {
						setSelectedFiles(values);
						if (values.length === 0) {
							setErrorMessage('Please select at least one file.');
							setStage('error');
							return;
						}

						setProgress({ current: 0, total: values.length, file: '' });
						setStage('running');
					}}
				/>
				<Text color={dryRun ? 'cyan' : 'gray'}>{dryRun ? 'Dry-run' : 'Execute'}</Text>
			</Box>
		);
	}

	if (stage === 'running') {
		const percent =
			progress.total === 0 ? 0 : Math.floor((progress.current / progress.total) * 100);

		return (
			<Box flexDirection="column" gap={1}>
				{dryRun ? <Text color="cyan">Dry run: no side effects.</Text> : null}
				<ProgressBar value={percent} />
				<Text>
					Processing {progress.current}/{progress.total} {progress.file}
				</Text>
			</Box>
		);
	}

	if (stage === 'success' && runResult) {
		const hasFailures = runResult.failed.length > 0;

		return (
			<Box flexDirection="column" gap={1}>
				<StatusMessage variant={hasFailures ? 'warning' : 'success'}>
					Processed {runResult.processed.length} files
					{hasFailures ? `, failed ${runResult.failed.length}` : ''}.
				</StatusMessage>
				<Text>Run again? [Y/n]</Text>
				<ConfirmInput
					onConfirm={() => {
						setRunResult(null);
						setStage('input');
					}}
					onCancel={props.onExit}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" gap={1}>
			<StatusMessage variant="error">{errorMessage || 'Unknown error.'}</StatusMessage>
			<Text>Retry? [Y/n]</Text>
			<ConfirmInput onConfirm={() => setStage('input')} onCancel={props.onExit} />
		</Box>
	);
}

export async function runHelloWorldInteractiveScreen(
	props: Omit<FeatureScreenProps, 'onExit'>,
): Promise<void> {
	await new Promise<void>((resolve) => {
		let unmounted = false;
		const app = render(
			<HelloWorldScreen
				{...props}
				onExit={() => {
					if (!unmounted) {
						unmounted = true;
						app.unmount();
					}
				}}
			/>,
		);

		app.waitUntilExit().finally(resolve);
	});
}

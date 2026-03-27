import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Select } from '@inkjs/ui';

import type { PlatformConfig } from '../platform/config/schema.js';
import type { ExecutionContext } from '../platform/execution-context.js';
import type { FeatureEntry } from '../features/types.js';

type WorkbenchAppProps = {
	features: FeatureEntry[];
	configSnapshot: Readonly<PlatformConfig>;
	configInfo: {
		globalPath: string;
		projectPath: string;
		projectLoaded: boolean;
	};
	abortSignal: AbortSignal;
	createExecutionContext: (options: {
		entryMode: 'cli' | 'workbench';
		dryRun: boolean;
	}) => ExecutionContext;
	onExit: () => void;
};

const WORKBENCH_BANNER = [
	'   _____ _',
	'  / ___/(_)___  __  ________',
	'  \\__ \\/ / __ \\/ / / / ___/',
	' ___/ / / / / / /_/ / /__',
	'/____/_/_/ /_/\\__, /\\___/',
	'             /____/',
].join('\n');

export function WorkbenchApp(props: WorkbenchAppProps): React.JSX.Element {
	const firstFeatureId = props.features[0]?.id ?? null;
	const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(firstFeatureId);
	const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
	const configStatus = props.configInfo.projectLoaded ? 'Project (Loaded)' : 'Project (Not Found)';
	const configLine = `⚙ Config: ${configStatus} | Global: ${props.configInfo.globalPath} | Project: ${props.configInfo.projectPath}`;

	useInput((input, key) => {
		if (key.ctrl && input === 'c') {
			props.onExit();
			return;
		}

		if (key.return && selectedFeatureId) {
			setActiveFeatureId(selectedFeatureId);
		}
	});

	const activeFeature = useMemo(
		() => props.features.find((item) => item.id === activeFeatureId) ?? null,
		[activeFeatureId, props.features],
	);

	if (activeFeature) {
		const FeatureScreen = activeFeature.getScreen();
		return (
			<FeatureScreen
				entryMode="workbench"
				configSnapshot={props.configSnapshot}
				abortSignal={props.abortSignal}
				createExecutionContext={props.createExecutionContext}
				onExit={() => setActiveFeatureId(null)}
			/>
		);
	}

	if (props.features.length === 0) {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">{WORKBENCH_BANNER}</Text>
				<Text>sinyuk-cli v0.1.0</Text>
				<Text color="yellowBright">No features registered yet.</Text>
				<Text dimColor>{configLine}</Text>
				<Text dimColor>Press Ctrl+C to quit.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" gap={1}>
			<Text color="blueBright">{WORKBENCH_BANNER}</Text>
			<Text>sinyuk-cli v0.1.0</Text>
			<Text dimColor>{configLine}</Text>
			<Text>Features</Text>
			<Select
				options={props.features.map((feature) => ({
					value: feature.id,
					label: `${feature.title}  ${feature.description}`,
				}))}
				defaultValue={selectedFeatureId ?? undefined}
				onChange={(value) => setSelectedFeatureId(value)}
			/>
			<Text dimColor>↑/↓ Navigate Enter Select Ctrl+C Quit</Text>
		</Box>
	);
}

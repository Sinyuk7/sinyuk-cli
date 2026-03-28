import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Select } from '@inkjs/ui';

import type { PlatformConfig } from '../platform/config/schema.js';
import type { ExecutionContext } from '../platform/execution-context.js';
import type { ActionEntry, FeatureDomain } from '../features/types.js';

type WorkbenchAppProps = {
	domains: FeatureDomain[];
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

type WorkbenchPhase =
	| { kind: 'select-domain' }
	| { kind: 'select-action'; domain: FeatureDomain }
	| { kind: 'launched'; action: ActionEntry };

const WORKBENCH_BANNER = [
	'   _____ _',
	'  / ___/(_)___  __  ________',
	'  \\__ \\/ / __ \\/ / / / ___/',
	' ___/ / / / / / /_/ / /__',
	'/____/_/_/ /_/\\__, /\\___/',
	'             /____/',
].join('\n');

/**
 * Workbench app — Launcher Activity pattern.
 *
 * INTENT: Two-level menu (domain → action) then launch and never return
 * INPUT: domains, config, signals
 * OUTPUT: React element tree
 * SIDE EFFECT: Launches Action screen on selection; calls onExit when Action completes
 * FAILURE: Empty domain/action lists show informational message
 */
export function WorkbenchApp(props: WorkbenchAppProps): React.JSX.Element {
	const [phase, setPhase] = useState<WorkbenchPhase>({ kind: 'select-domain' });
	const configStatus = props.configInfo.projectLoaded ? 'Project (Loaded)' : 'Project (Not Found)';
	const configLine = `⚙ Config: ${configStatus} | Global: ${props.configInfo.globalPath} | Project: ${props.configInfo.projectPath}`;

	useInput((input, key) => {
		if (key.ctrl && input === 'c') {
			props.onExit();
		}
	});

	// Phase: launched — render the Action screen, never go back
	if (phase.kind === 'launched') {
		const ActionScreen = phase.action.getScreen();
		return (
			<ActionScreen
				entryMode="workbench"
				configSnapshot={props.configSnapshot}
				abortSignal={props.abortSignal}
				createExecutionContext={props.createExecutionContext}
				onExit={props.onExit}
			/>
		);
	}

	// Phase: select-action — user picked a domain, now pick an action
	if (phase.kind === 'select-action') {
		const { domain } = phase;

		// Auto-launch if domain has exactly 1 action
		if (domain.actions.length === 1) {
			setPhase({ kind: 'launched', action: domain.actions[0] });
			return <Text>Launching {domain.actions[0].title}...</Text>;
		}

		return (
			<Box flexDirection="column" gap={1}>
				<Text color="blueBright">{WORKBENCH_BANNER}</Text>
				<Text>sinyuk-cli v0.1.0</Text>
				<Text dimColor>{configLine}</Text>
				<Text>{domain.title} › Select action</Text>
				<Select
					options={domain.actions.map((action) => ({
						value: action.id,
						label: `${action.title}  ${action.description}`,
					}))}
					onChange={(actionId) => {
						const action = domain.actions.find((a) => a.id === actionId);
						if (action) {
							setPhase({ kind: 'launched', action });
						}
					}}
				/>
				<Text dimColor>↑/↓ Navigate  Enter Select  Ctrl+C Quit</Text>
			</Box>
		);
	}

	// Phase: select-domain — initial screen
	if (props.domains.length === 0) {
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
				options={props.domains.map((domain) => ({
					value: domain.id,
					label: `${domain.title}  ${domain.description}`,
				}))}
				onChange={(domainId) => {
					const domain = props.domains.find((d) => d.id === domainId);
					if (domain) {
						setPhase({ kind: 'select-action', domain });
					}
				}}
			/>
			<Text dimColor>↑/↓ Navigate  Enter Select  Ctrl+C Quit</Text>
		</Box>
	);
}
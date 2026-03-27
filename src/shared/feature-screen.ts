import type { ComponentType } from 'react';

import type { PlatformConfig } from '../platform/config/schema.js';
import type { EntryMode, ExecutionContext } from '../platform/execution-context.js';

export type FeatureScreenProps = {
	entryMode: EntryMode;
	configSnapshot: Readonly<PlatformConfig>;
	abortSignal: AbortSignal;
	createExecutionContext: (options: { entryMode: EntryMode; dryRun: boolean }) => ExecutionContext;
	onExit: () => void;
};

export type FeatureScreenComponent = ComponentType<FeatureScreenProps>;

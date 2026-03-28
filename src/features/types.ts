import type { CommandClass } from 'clipanion';

import type { SinyukCliContext } from '../cli/context.js';
import type { FeatureScreenComponent } from '../shared/feature-screen.js';

/**
 * A single executable action within a feature domain.
 * Analogous to an Android Activity — one focused task with its own
 * Zustand store, screen, pages, and CLI command.
 */
export type ActionEntry = {
	id: string;
	title: string;
	description: string;
	getCommand: () => CommandClass<SinyukCliContext>;
	getScreen: () => FeatureScreenComponent;
};

/**
 * A feature domain grouping related actions under one namespace.
 * Analogous to an Android app module — provides shared config, types,
 * and utilities that its actions consume.
 *
 * CLI routing: `sinyuk-cli <domain.id> <action.id> [options]`
 * Workbench:   select domain → select action → launch → exit
 */
export type FeatureDomain = {
	id: string;
	title: string;
	description: string;
	actions: ActionEntry[];
	getCliCommands?: () => CommandClass<SinyukCliContext>[];
};


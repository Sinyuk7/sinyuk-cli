import type { CommandClass } from 'clipanion';

import type { SinyukCliContext } from '../cli/context.js';
import type { FeatureScreenComponent } from '../shared/feature-screen.js';

export type FeatureEntry = {
	id: string;
	title: string;
	description: string;
	getCommand: () => CommandClass<SinyukCliContext>;
	getScreen: () => FeatureScreenComponent;
};

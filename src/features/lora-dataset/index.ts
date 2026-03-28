import type { FeatureDomain } from '../types.js';
import { LoraDatasetHelpCommand } from './command.js';
import { getCaptionAction } from './caption/index.js';
import { getCropAction } from './crop/index.js';

export function getLoraDatasetDomain(): FeatureDomain {
	return {
		id: 'lora-dataset',
		title: 'Lora Dataset',
		description: 'AI caption and crop tools for image datasets',
		actions: [getCaptionAction(), getCropAction()],
		getCliCommands: () => [LoraDatasetHelpCommand],
	};
}

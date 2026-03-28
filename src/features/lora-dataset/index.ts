import type { FeatureDomain } from '../types.js';
import { LoraDatasetHelpCommand } from './command.js';
import { getCaptionAction } from './caption/index.js';
import { getCropAction } from './crop/index.js';

/**
 * Register the lora-dataset feature domain.
 *
 * INTENT: Expose the domain-level CLI/help entry and grouped actions from one feature root
 * INPUT: none
 * OUTPUT: FeatureDomain
 * SIDE EFFECT: none
 * FAILURE: none
 *
 * See also: src/features/lora-dataset/README.md
 */
export function getLoraDatasetDomain(): FeatureDomain {
	return {
		id: 'lora-dataset',
		title: 'Lora Dataset',
		description: 'AI caption and crop tools for image datasets',
		actions: [getCaptionAction(), getCropAction()],
		getCliCommands: () => [LoraDatasetHelpCommand],
	};
}

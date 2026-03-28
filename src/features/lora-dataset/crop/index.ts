import type { ActionEntry } from '../../types.js';
import { CropCommand } from './command.js';
import { CropScreen } from './screen.js';

export function getCropAction(): ActionEntry {
	return {
		id: 'crop',
		title: 'Crop',
		description: 'Batch crop dataset images to target ratio and size',
		getCommand: () => CropCommand,
		getScreen: () => CropScreen,
	};
}

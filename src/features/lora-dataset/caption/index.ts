import type { ActionEntry } from '../../types.js';
import { CaptionCommand } from './command.js';
import { CaptionScreen } from './screen.js';

export function getCaptionAction(): ActionEntry {
	return {
		id: 'caption',
		title: 'Caption',
		description: 'Run AI caption pipeline on dataset images',
		getCommand: () => CaptionCommand,
		getScreen: () => CaptionScreen,
	};
}

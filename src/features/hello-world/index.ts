import { HelloWorldRunCommand } from './command.js';
import { HelloWorldScreen } from './screen.js';
import type { FeatureEntry } from '../types.js';

export function getHelloWorldFeatureEntry(): FeatureEntry {
	return {
		id: 'hello-world',
		title: 'hello-world',
		description: 'Run hello-world demo pipeline',
		getCommand: () => HelloWorldRunCommand,
		getScreen: () => HelloWorldScreen,
	};
}

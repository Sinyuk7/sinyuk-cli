import type { FeatureDomain } from '../types.js';
import { HelloWorldRunCommand } from './command.js';
import { HelloWorldScreen } from './screen.js';

export function getHelloWorldDomain(): FeatureDomain {
	return {
		id: 'hello-world',
		title: 'Hello World',
		description: 'Demo pipeline for file processing',
		actions: [
			{
				id: 'run',
				title: 'Run',
				description: 'Run hello-world demo pipeline',
				getCommand: () => HelloWorldRunCommand,
				getScreen: () => HelloWorldScreen,
			},
		],
	};
}
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { Command } from 'clipanion';

import type { SinyukCliContext } from '../cli/context.js';

function getGlobalConfigPath(): string {
	return join(homedir(), '.config', 'sinyuk', 'config.yaml');
}

function buildInitialGlobalConfig(): string {
	return `features:
  hello-world:
    includeHidden: false
`;
}

export class InitCommand extends Command<SinyukCliContext> {
	static override paths = [['init']];

	static override usage = Command.Usage({
		category: 'General',
		description: 'Create global config file',
		examples: [['Create ~/.config/sinyuk/config.yaml', '$0 init']],
	});

	override async execute(): Promise<number> {
		const globalPath = getGlobalConfigPath();
		if (existsSync(globalPath)) {
			this.context.stdout.write(`Global config already exists at ${globalPath}\n`);
			return 0;
		}

		mkdirSync(dirname(globalPath), { recursive: true });
		writeFileSync(globalPath, buildInitialGlobalConfig(), 'utf8');
		this.context.stdout.write(`Created global config at ${globalPath}\n`);
		return 0;
	}
}

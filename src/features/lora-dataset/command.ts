import { Command } from 'clipanion';
import type { Writable } from 'node:stream';

import type { SinyukCliContext } from '../../cli/context.js';

function writeDomainHelp(stdout: Writable): void {
	stdout.write('lora-dataset actions:\n');
	stdout.write('  caption  Run AI caption preview or full batch on dataset images.\n');
	stdout.write('  crop     Open the interactive crop planner for dataset images.\n');
	stdout.write('\n');
	stdout.write('Examples:\n');
	stdout.write('  sinyuk-cli lora-dataset caption --path ./images\n');
	stdout.write('  sinyuk-cli lora-dataset caption --path ./images --full --confirm-full\n');
	stdout.write('  sinyuk-cli lora-dataset crop --path ./images\n');
}

/**
 * Bare domain help command for `sinyuk-cli lora-dataset`.
 *
 * INTENT: Make the domain/action contract explicit when the user omits an action name
 * INPUT: none
 * OUTPUT: exit code 0
 * SIDE EFFECT: Writes usage guidance to stdout
 * FAILURE: None
 */
export class LoraDatasetHelpCommand extends Command<SinyukCliContext> {
	static override paths = [['lora-dataset']];

	static override usage = Command.Usage({
		category: 'Features',
		description: 'Show lora-dataset actions',
	});

	override async execute(): Promise<number> {
		writeDomainHelp(this.context.stdout);
		return 0;
	}
}

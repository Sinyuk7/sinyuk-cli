import type { BaseContext } from 'clipanion';

export type SinyukCliContext = BaseContext & {
	cwd: string;
};

export function getCommandCwd(context: SinyukCliContext): string {
	return context.cwd;
}

export function isInteractiveTty(context: SinyukCliContext): boolean {
	const stdout = context.stdout as NodeJS.WriteStream;

	return Boolean(stdout.isTTY);
}

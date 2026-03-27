import { describe, expect, test } from 'vitest';

import {
	getInteractiveFallbackDecision,
	isCiEnvironment,
} from '../../src/platform/shutdown/fallback-policy.js';

describe('isCiEnvironment', () => {
	test('returns true when CI is set to 1', () => {
		expect(isCiEnvironment({ CI: '1' })).toBe(true);
	});

	test('returns false when CI is unset or false-like', () => {
		expect(isCiEnvironment({})).toBe(false);
		expect(isCiEnvironment({ CI: '0' })).toBe(false);
		expect(isCiEnvironment({ CI: 'false' })).toBe(false);
	});
});

describe('getInteractiveFallbackDecision', () => {
	test('denies fallback when input is complete', () => {
		const decision = getInteractiveFallbackDecision({
			hasMissingRequiredInput: false,
			isTTY: true,
			envSnapshot: {},
		});

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain('missing required input');
	});

	test('allows fallback only when missing input in tty and not ci', () => {
		const decision = getInteractiveFallbackDecision({
			hasMissingRequiredInput: true,
			isTTY: true,
			envSnapshot: {},
		});

		expect(decision.allowed).toBe(true);
	});

	test('denies fallback when non-tty', () => {
		const decision = getInteractiveFallbackDecision({
			hasMissingRequiredInput: true,
			isTTY: false,
			envSnapshot: {},
		});

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain('non-interactive');
	});

	test('denies fallback when ci is enabled', () => {
		const decision = getInteractiveFallbackDecision({
			hasMissingRequiredInput: true,
			isTTY: true,
			envSnapshot: { CI: '1' },
		});

		expect(decision.allowed).toBe(false);
		expect(decision.reason).toContain('CI mode');
	});
});

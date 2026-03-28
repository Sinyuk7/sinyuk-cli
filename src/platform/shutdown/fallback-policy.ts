export type FallbackDecision = {
	allowed: boolean;
	reason?: string;
};

export function isCiEnvironment(
	envSnapshot: Readonly<Record<string, string | undefined>>,
): boolean {
	const value = envSnapshot.CI;
	if (!value) {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return normalized !== '0' && normalized !== 'false';
}

/**
"""Decide whether command input should fall back to interactive Ink flow.

INTENT: 统一缺参时的降级策略，确保只在 TTY 且非 CI 场景触发交互
INPUT: hasMissingRequiredInput, isTTY, envSnapshot
OUTPUT: FallbackDecision
SIDE EFFECT: None
FAILURE: None
"""
 */
export function getInteractiveFallbackDecision(input: {
	hasMissingRequiredInput: boolean;
	isTTY: boolean;
	envSnapshot: Readonly<Record<string, string | undefined>>;
	requiredInputHint?: string;
}): FallbackDecision {
	const requiredInputHint = input.requiredInputHint ?? 'required command inputs';

	if (!input.hasMissingRequiredInput) {
		return {
			allowed: false,
			reason: 'Fallback is only allowed for missing required input.',
		};
	}

	if (!input.isTTY) {
		return {
			allowed: false,
			reason: `Missing required inputs for non-interactive mode. Provide ${requiredInputHint}.`,
		};
	}

	if (isCiEnvironment(input.envSnapshot)) {
		return {
			allowed: false,
			reason: `Missing required inputs in CI mode. Provide ${requiredInputHint}; interactive fallback is disabled in CI.`,
		};
	}

	return { allowed: true };
}

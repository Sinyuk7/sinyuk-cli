import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { LoraScanResult } from '../shared/artifacts.js';
import type { CropRatioStat } from '../shared/types.js';
import { PLATFORM_CONFIG } from './_test-helpers.js';

const { mockLoadCropScanContext, mockExecuteCropPlan } = vi.hoisted(() => ({
	mockLoadCropScanContext: vi.fn(),
	mockExecuteCropPlan: vi.fn(),
}));

vi.mock('../shared/crop-plan.js', async () => {
	const actual =
		await vi.importActual<typeof import('../shared/crop-plan.js')>('../shared/crop-plan.js');

	return {
		...actual,
		loadCropScanContext: mockLoadCropScanContext,
	};
});

vi.mock('../crop/run.js', () => ({
	executeCropPlan: mockExecuteCropPlan,
}));

import { createCropStore } from '../crop/store.js';

const EMPTY_SCAN_RESULT: LoraScanResult = {
	basePath: '/tmp/empty-dataset',
	images: [],
	extensionCounts: {},
};

const EMPTY_RATIO_STATS: CropRatioStat[] = [
	{ ratio: '1:1', count: 0 },
	{ ratio: '3:4', count: 0 },
	{ ratio: '4:3', count: 0 },
];

/**
"""Create a crop store bound to the shared feature test config.

INTENT: Reuse one stable crop store setup across empty-state and selection-order tests
INPUT: none
OUTPUT: crop store instance
SIDE EFFECT: None
FAILURE: None
"""
 */
function createTestStore() {
	return createCropStore({
		configSnapshot: PLATFORM_CONFIG,
		abortSignal: AbortSignal.timeout(5_000),
	});
}

describe('crop store', () => {
	beforeEach(() => {
		mockLoadCropScanContext.mockReset();
		mockExecuteCropPlan.mockReset();
	});

	test('transitions to empty when scan finds no supported images', async () => {
		mockLoadCropScanContext.mockResolvedValue({
			scanResult: EMPTY_SCAN_RESULT,
			ratioStats: EMPTY_RATIO_STATS,
		});

		const store = createTestStore();
		await store.getState().actions.startScan('/tmp/empty-dataset');

		expect(store.getState().step).toBe('empty');
		expect(store.getState().scanResult).toEqual(EMPTY_SCAN_RESULT);
		expect(store.getState().errorMessage).toBeNull();
	});

	test('setSelectedRatios normalizes order and prunes stale resolutions', () => {
		const store = createTestStore();
		store.setState({
			selectedRatios: ['3:4', '1:1'],
			resolutionByRatio: {
				'1:1': 512,
				'3:4': 768,
				'4:3': 1024,
			},
		});

		store.getState().actions.setSelectedRatios(['4:3', '1:1']);

		expect(store.getState().selectedRatios).toEqual(['1:1', '4:3']);
		expect(store.getState().resolutionByRatio).toEqual({
			'1:1': 512,
			'4:3': 1024,
		});
	});
});

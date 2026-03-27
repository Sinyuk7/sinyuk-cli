import { getHelloWorldFeatureEntry } from './hello-world/index.js';
import type { FeatureEntry } from './types.js';

const FEATURES: FeatureEntry[] = [getHelloWorldFeatureEntry()];

export function getFeatureRegistry(): FeatureEntry[] {
	return FEATURES;
}

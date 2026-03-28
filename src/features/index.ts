import { getHelloWorldDomain } from './hello-world/index.js';
import { getLoraDatasetDomain } from './lora-dataset/index.js';
import type { FeatureDomain } from './types.js';

const DOMAINS: FeatureDomain[] = [getHelloWorldDomain(), getLoraDatasetDomain()];

/**
 * Return all registered feature domains.
 *
 * INTENT: Single registry consumed by both CLI (command collection) and Workbench (menu rendering)
 * INPUT: none
 * OUTPUT: FeatureDomain[]
 * SIDE EFFECT: none
 * FAILURE: none
 */
export function getFeatureDomains(): FeatureDomain[] {
	return DOMAINS;
}
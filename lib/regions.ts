
import { PH_REGIONS, type PhRegion } from '@/types/entities/common';

// Philippine Regions
export const REGIONS = ['All', ...PH_REGIONS] as const;
export const ALL_REGIONS: readonly PhRegion[] = PH_REGIONS;

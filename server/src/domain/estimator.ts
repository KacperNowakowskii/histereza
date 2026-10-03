import type { ServiceTimeHistory } from '@histereza/shared/types';
import { CONFIG } from '@histereza/shared/config';
export function percentile(values: number[], p: number) { const sorted = [...values].sort((a,b) => a-b); return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)] : 10; }
export function estimate(history: ServiceTimeHistory[], businessId: string, bayId: string, cargoType: string, override?: number) {
  const valid = history.filter(h => !h.excluded);
  const levels = [valid.filter(h => h.businessId === businessId && h.bayId === bayId && h.cargoType === cargoType), valid.filter(h => h.businessId === businessId && h.cargoType === cargoType), valid.filter(h => h.cargoType === cargoType), valid];
  const sample = levels.find(x => x.length >= 5) ?? valid;
  const values = sample.map(h => h.durationMin);
  return Math.max(percentile(values, CONFIG.MIN_OVERRIDE_PERCENTILE), override ?? percentile(values, CONFIG.SERVICE_PERCENTILE));
}

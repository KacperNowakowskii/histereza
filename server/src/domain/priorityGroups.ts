import type { State, Stop } from '@histereza/shared/types';
import { priorityRank } from '@histereza/shared/priorities';
export function stopPriority(s: State, stop: Stop) {
  return Math.min(...stop.deliveryIds.map(id => priorityRank(s.deliveries.find(d => d.id === id)!)));
}
export function priorityEligible(s: State, stop: Stop) {
  // Zapisane wcześniej plany pozostają nienaruszone; nowe plany deklarują grupy.
  if (!s.routes.find(r => r.id === stop.routeId)?.priorityGroupsApplied) return true;
  const rank = stopPriority(s, stop);
  return !s.stops.some(other => other.routeId === stop.routeId && other.status !== 'done' && stopPriority(s, other) < rank);
}

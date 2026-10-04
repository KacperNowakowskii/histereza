import type { State, Courier, Stop } from '@histereza/shared/types';
import { MINUTE } from '@histereza/shared/config';
export function availableAt(s: State, c: Courier, stop?: Stop) {
  const p = c.pause;
  if (!p) return c.readyAt;
  if (p.phase === 'buffer') return Math.max(c.readyAt, p.resumeAt ?? s.now);
  if (p.phase === 'active') return Math.max(c.readyAt, s.now, p.expectedEnd ?? s.now) + 5*MINUTE;
  const st = s.stops.find(st => st.id === p.afterStopId);
  if(stop && st && stop.sequence<=st.sequence) return c.readyAt;
  return Math.max(c.readyAt, s.now, st?.expectedDeparture ?? ((st?.plannedArrival ?? s.now)+(st?.plannedServiceMin ?? 0)*MINUTE)) + (p.minutes+5)*MINUTE;
}
export const paused = (s: State, c: Courier) => c.pause?.phase === 'active' || (c.pause?.phase === 'buffer' && s.now < (c.pause.resumeAt ?? Infinity));

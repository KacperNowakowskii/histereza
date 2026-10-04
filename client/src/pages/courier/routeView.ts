import type { Courier, Route, State } from '@histereza/shared/types';
import { MINUTE } from '@histereza/shared/config';
export function routeView(s: State, c: Courier, route: Route) {
  const stops = s.stops.filter(st => st.routeId === route.id).sort((a,b) => a.sequence-b.sequence);
  const target = stops.find(st => st.id === c.targetStopId && st.status !== 'done');
  const current = c.status === 'servicing' ? target : undefined;
  const unavailable = c.pause?.phase==='active' || (c.pause?.phase==='buffer' && s.now<(c.pause.resumeAt ?? Infinity));
  const next = unavailable ? undefined : current ? stops.find(st => st.status !== 'done' && st.id !== current.id && st.sequence > current.sequence) : target ?? stops.find(st => st.status !== 'done');
  const completed = stops.filter(st => st.status === 'done').length;
  // Planowany czas, niezależny od automatycznego przedłużania expectedDeparture.
  const remainingSeconds = current?.status === 'servicing' ? Math.max(0, Math.ceil(((current.actualArrival ?? s.now) + current.plannedServiceMin*MINUTE - s.now)/1000)) : undefined;
  return { stops, current, next, completed, remainingSeconds };
}
export const navigationUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}&travelmode=driving`;

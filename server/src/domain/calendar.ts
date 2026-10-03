import type { State, Reservation, Stop } from '@histereza/shared/types';
import { CONFIG, MINUTE } from '@histereza/shared/config';
import { at, day } from '../sim/clock';
import { fits, vehicleSct } from './vehicles';
import { deliveryWindows } from './rules';
export const active = (r: Reservation) => r.status === 'confirmed';
export function intervals(date: string, from: string, to: string) {
  const start = at(date, from); let end = at(date, to);
  if (end <= start) end += 24 * 60 * MINUTE;
  return { start, end };
}
export function within(date: string, from: string, to: string, start: number, end: number) {
  const today = intervals(date, from, to);
  const yesterday = { start: today.start - 24 * 60 * MINUTE, end: today.end - 24 * 60 * MINUTE };
  return [today, yesterday].some(w => start >= w.start && end <= w.end);
}
export function legal(s: State, bayId: string, start: number, end: number, stop?: Stop) {
  const bay = s.bays.find(b => b.id === bayId); if (!bay || bay.status === 'closed') return false;
  const zone = s.zones.find(z => z.id === bay.zoneId)!;
  if (s.rules.some(r => r.target === bayId && start < r.validTo && end > r.validFrom)) return false;
  if (!zone.deliveryWindows.some(w => within(day(start), w.from, w.to, start, end))) return false;
  if (!s.schedules.some(x => x.bayId === bayId && x.function === 'deliveries' && (x.day === '*' || x.day === day(start)) && within(day(start), x.from, x.to, start, end))) return false;
  if (stop) {
    const route = s.routes.find(r => r.id === stop.routeId)!;
    const v = s.vehicles.find(v => v.id === route.vehicleId)!; const m = s.models.find(m => m.id === v.vehicleModelId)!;
    if (!fits(m, bay) || (zone.sct && vehicleSct(v, m, day(start)) === 'forbidden')) return false;
    if (!stop.eligibleBayIds.includes(bayId)) return false;
    if (stop.notBefore && start < stop.notBefore) return false;
    for (const id of stop.deliveryIds) {
      const d = s.deliveries.find(d => d.id === id)!; const b = s.businesses.find(b => b.id === d.businessId)!;
      if (!deliveryWindows(s,d).some(w => within(day(start), w.from, w.to, start, end))) return false;
    }
  }
  return true;
}
export function available(s: State, bayId: string, start: number, end: number, excludeId?: string) {
  const buffer = CONFIG.BUFFER_MIN * MINUTE;
  return !s.reservations.some(r => (active(r) || r.status === 'completed') && r.id !== excludeId && r.bayId === bayId && start < r.end + buffer && end + buffer > r.start)
    && !s.external.some(e => e.bayId === bayId && e.status === 'active' && start < e.allowedUntil + buffer && end > e.start)
    && !s.stops.some(st => st.bayId === bayId && st.status === 'servicing' && st.id !== s.reservations.find(r => r.id === excludeId)?.stopId && start < (st.expectedDeparture ?? st.plannedArrival + st.plannedServiceMin * MINUTE) + buffer);
}
export function findSlot(s: State, stop: Stop, earliest: number, maxDays = 4, excludeId?: string) {
  if (!s.online) return undefined;
  const endSearch = earliest + maxDays * 24 * 60 * MINUTE;
  for (let start = Math.ceil(earliest / MINUTE) * MINUTE; start < endSearch; start += MINUTE) {
    const end = start + stop.plannedServiceMin * MINUTE;
    for (const bayId of stop.eligibleBayIds) if (s.sensors.find(x => x.bayId === bayId)?.healthy && legal(s, bayId, start, end, stop) && available(s, bayId, start, end, excludeId)) return { bayId, start, end };
  }
  return undefined;
}

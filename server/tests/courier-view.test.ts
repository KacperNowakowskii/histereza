import { describe, expect, it } from 'vitest';
import { seed } from '../src/db/seed';
import { routeView, navigationUrl } from '../../client/src/pages/courier/routeView';
import type { Stop, Route } from '@histereza/shared/types';
import { MINUTE } from '@histereza/shared/config';
function fixture() {
  const s = seed(), c = s.couriers[0];
  const route: Route = { id: 'mine', courierId: c.id, vehicleId: 'vehicle1', date: s.planningDate, stopIds: ['a','b','c'], breaks: [], loadingList: [] };
  const stop = (id: string, sequence: number, routeId = route.id): Stop => ({ id, routeId, sequence, bayId: 'bay1', bayGroupId: 'group1', deliveryIds: [], plannedArrival: s.now, plannedServiceMin: 10, frozen: false, status: 'pending', eligibleBayIds: ['bay1'] });
  s.stops = [stop('c',2), stop('foreign',0,'other'), stop('a',0), stop('b',1)];
  return { s,c,route };
}
describe('Widok własnej trasy kuriera', () => {
  it('izoluje trasę, porządkuje punkty i uwzględnia cel wybrany przez system', () => {
    const {s,c,route} = fixture(); c.status = 'driving'; c.targetStopId = 'b';
    const v = routeView(s,c,route); expect(v.stops.map(st=>st.id)).toEqual(['a','b','c']); expect(v.current).toBeUndefined(); expect(v.next?.id).toBe('b');
  });
  it('wyróżnia obsługiwany i kolejny punkt oraz liczy zakończone', () => {
    const {s,c,route} = fixture(); c.status = 'servicing'; c.targetStopId = 'b'; s.stops.find(st=>st.id==='a')!.status='done'; const current=s.stops.find(st=>st.id==='b')!; current.status='servicing'; current.actualArrival=s.now-3*MINUTE;
    const v=routeView(s,c,route); expect(v.current?.id).toBe('b'); expect(v.next?.id).toBe('c'); expect(v.completed).toBe(1); expect(v.remainingSeconds).toBe(420);
  });
  it('nie przedłuża licznika przez expectedDeparture i zatrzymuje go na zerze', () => {
    const {s,c,route}=fixture(); c.status='servicing'; c.targetStopId='a'; const st=s.stops.find(st=>st.id==='a')!; st.status='servicing'; st.actualArrival=s.now-11*MINUTE; st.expectedDeparture=s.now+5*MINUTE;
    expect(routeView(s,c,route).remainingSeconds).toBe(0);
  });
  it('zakończona trasa nie pokazuje kolejnego celu ani licznika', () => {
    const {s,c,route}=fixture(); s.stops.forEach(st=>st.status='done'); c.status='finished';
    const v=routeView(s,c,route); expect(v.completed).toBe(3); expect(v.next).toBeUndefined(); expect(v.remainingSeconds).toBeUndefined();
  });
  it('tworzy link Google Maps do dokładnych współrzędnych celu', () => {
    const url=new URL(navigationUrl(50.05,19.93)); expect(url.hostname).toBe('www.google.com'); expect(url.searchParams.get('destination')).toBe('50.05,19.93'); expect(url.searchParams.get('travelmode')).toBe('driving');
  });
});

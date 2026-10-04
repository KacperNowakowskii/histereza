import type { State, Stop } from '@histereza/shared/types';
import { paused } from './courierAvailability';
import { MINUTE } from '@histereza/shared/config';
import { priorityEligible } from './priorityGroups';
function gateDraft(s: State, courierId: string) {
  const c=s.couriers.find(c=>c.id===courierId)!;
  if(c.status==='driving'||c.status==='servicing') return s.stops.find(st=>st.id===c.targetStopId);
  if (paused(s,c)) { delete c.targetStopId; return undefined; }
  if(c.pause?.phase==='buffer') delete c.pause;
  const route=s.routes.find(r=>r.courierId===courierId&&r.date===s.planningDate);if(!route)return undefined;
  const options=s.stops.filter(st=>st.routeId===route.id&&st.status==='pending'&&(!st.notBefore||st.notBefore<=s.now)&&priorityEligible(s,st));
  const next=options.find(st=>st.id===c.targetStopId)??options.sort((a,b)=>a.plannedArrival-b.plannedArrival||a.sequence-b.sequence)[0];
  c.targetStopId=next?.id;c.status=next?'gate':s.stops.some(st=>st.routeId===route.id&&st.status!=='done')?'gate':'finished';return next;
}
export function decideGate(s:State,courierId:string){const next=structuredClone(s);const stop=gateDraft(next,courierId);return {courier:next.couriers.find(c=>c.id===courierId)!,stopId:stop?.id};}
export const canDrive = (s: State, stop: Stop, readyAt: number) => !paused(s,s.couriers.find(c=>c.id===s.routes.find(r=>r.id===stop.routeId)!.courierId)!) && priorityEligible(s,stop) && s.online && s.now>=readyAt && !s.rules.some(r=>r.target===stop.bayId&&r.validFrom<=s.now&&r.validTo>s.now) && !!s.reservations.find(r=>r.stopId===stop.id&&r.status==='confirmed'&&r.end>s.now) && s.now >= stop.plannedArrival - 20 * MINUTE;

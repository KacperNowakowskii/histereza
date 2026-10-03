import type { State } from '@histereza/shared/types';
import { CONFIG, MINUTE } from '@histereza/shared/config';
import { legal } from './calendar';
export function allowedUntil(s: State, bayId: string) {
  const next = s.reservations.filter(r => r.bayId === bayId && r.status === 'confirmed' && r.end > s.now).sort((a,b) => a.start-b.start)[0];
  const limit=Math.min(s.now + CONFIG.EXTERNAL_MAX_MIN * MINUTE, next ? next.start - CONFIG.BUFFER_MIN * MINUTE : Infinity);
  if(limit<=s.now)return limit;
  for(let end=s.now+MINUTE;end<=limit;end+=MINUTE)if(!legal(s,bayId,s.now,end))return end-MINUTE;
  return limit;
}
export function bayScreen(s:State,bayId:string) {
  const sensor=s.sensors.find(x=>x.bayId===bayId)!;
  if(!sensor.healthy||!s.online)return {status:'unknown',until:undefined,qrUntil:s.now};
  if(!legal(s,bayId,s.now,s.now+MINUTE))return {status:'unavailable',until:undefined,qrUntil:s.now};
  if(sensor.occupied) {
    const servicing=s.stops.find(st=>st.bayId===bayId&&st.status==='servicing');const ext=s.external.find(e=>e.bayId===bayId&&['active','overstay'].includes(e.status));
    return {status:'occupied',until:servicing?.expectedDeparture??ext?.allowedUntil,qrUntil:s.now};
  }
  const next=s.reservations.filter(r=>r.bayId===bayId&&r.status==='confirmed'&&r.end>s.now).sort((a,b)=>a.start-b.start)[0];
  let until=next?next.start-CONFIG.BUFFER_MIN*MINUTE:s.now+24*60*MINUTE;
  for(let end=s.now+MINUTE;end<=until;end+=MINUTE)if(!legal(s,bayId,s.now,end)){until=end-MINUTE;break;}
  return {status:until<=s.now?'reserved':'free',until,qrUntil:allowedUntil(s,bayId)};
}

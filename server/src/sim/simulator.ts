import type { State } from '@histereza/shared/types';
import { CONFIG, MINUTE } from '@histereza/shared/config';
import { predict } from '../domain/predictor';
import { repair } from '../services/repairService';
import { gate } from '../services/gateService';
import { findSlot } from '../domain/calendar';
import { plan } from '../services/planningService';
import { at } from './clock';
import { distance } from '../domain/geo';
import { incident, notify, event } from '../services/dayService';
export function tick(s:State,minutes=1) {
  for(let i=0;i<minutes;i++) {
    s.now+=MINUTE;
    // Symulowane czujniki przekazują bieżący stan w każdym ticku.
    for(const sensor of s.sensors)if(sensor.healthy)sensor.ts=s.now;
    if(!s.cutoffApplied&&s.now>=at(s.planningDate,'00:00')-6*60*MINUTE) {if(!s.routes.length)plan(s,s.planningDate);s.cutoffApplied=true;event(s,'cutoff','system',{});}
    if(!s.online)continue;
    for(const st of s.stops.filter(st=>st.status==='servicing'))if((st.expectedDeparture??Infinity)<s.now)st.expectedDeparture=s.now+5*MINUTE;
    for(const sensor of s.sensors) if(sensor.healthy&&sensor.occupied&&!s.stops.some(st=>st.bayId===sensor.bayId&&st.status==='servicing')&&!s.external.some(e=>e.bayId===sensor.bayId&&e.status==='active')) {
      const nearby=s.couriers.some(c=>c.status==='driving'&&s.stops.find(st=>st.id===c.targetStopId)?.bayId===sensor.bayId&&distance(c.location,s.bays.find(b=>b.id===sensor.bayId)!)<=60);
      if(!nearby)incident(s,'Zajęte bez kuriera',sensor.bayId,{sensor});
    }
    s.predictions=predict(s);for(const key of Object.keys(s.candidateSince))if(!s.predictions.some(p=>p.reservationId===key))delete s.candidateSince[key];for(const p of s.predictions)repair(s,p);
    for(const r of s.reservations.filter(r=>r.status==='confirmed'&&r.stopId&&s.now>=r.start+CONFIG.NO_SHOW_TOL_MIN*MINUTE)) {
      const st=s.stops.find(st=>st.id===r.stopId)!;const c=s.couriers.find(c=>s.routes.find(rt=>rt.id===st.routeId)?.courierId===c.id)!;const sensor=s.sensors.find(x=>x.bayId===r.bayId)!;
      if(['pending','driving'].includes(st.status)&&c.online&&sensor.healthy) {r.status='no-show';r.version++;st.status=st.frozen?'driving':'waiting';notify(s,c.userId,'Slot zwolniony po 5 minutach; system szuka kolejnego. Bez pogorszenia dostępu.');event(s,'no-show','system',{reservationId:r.id});}
    }
    for(const st of s.stops.filter(st=>st.status==='waiting'||(st.status==='driving'&&!s.reservations.some(r=>r.stopId===st.id&&r.status==='confirmed')))) {
      const old=s.reservations.find(r=>r.stopId===st.id)!;const slot=findSlot(s,st,Math.max(s.now+MINUTE,st.notBefore??0),4,old?.id);
      if(slot&&old) {Object.assign(old,slot,{status:'confirmed',version:old.version+1});st.bayId=slot.bayId;st.plannedArrival=slot.start;st.status=st.frozen?'driving':'pending';notify(s,s.couriers.find(c=>c.id===s.routes.find(r=>r.id===st.routeId)!.courierId)!.userId,'Przydzielono najbliższy legalny slot.');}
    }
    for(const c of s.couriers.filter(c=>c.status==='gate'))gate(s,c.id);
    for(const e of s.external.filter(e=>e.status==='active'&&s.now>e.allowedUntil)) {e.status='overstay';incident(s,'Przekroczony postój QR',e.bayId,{externalParkingId:e.id,allowedUntil:e.allowedUntil});}
  }
  return s;
}

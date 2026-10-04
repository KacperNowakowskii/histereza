import type { State, Prediction } from '@histereza/shared/types';
import { CONFIG, MINUTE } from '@histereza/shared/config';
import { legal } from './calendar';
import { availableAt } from './courierAvailability';
import { travelMin } from './geo';
export function predict(s: State): Prediction[] {
  const out:Prediction[]=[];
  for(const r of s.reservations.filter(r=>r.status==='confirmed'&&r.start<=s.now+CONFIG.HORIZON_MIN*MINUTE&&r.end>s.now)) {
    const st=s.stops.find(st=>st.id===r.stopId);if(!st||st.status==='done')continue;
    const route=s.routes.find(x=>x.id===st.routeId)!;const c=s.couriers.find(x=>x.id===route.courierId)!;
    const bay=s.bays.find(x=>x.id===r.bayId)!;
    const preceding=s.stops.filter(x=>x.routeId===st.routeId&&x.sequence<st.sequence&&x.status!=='done');
    const ownBusy=preceding.reduce((end,x)=>Math.max(end,(x.expectedDeparture??x.plannedArrival+x.plannedServiceMin*MINUTE)),0);
    const arrival=Math.max(s.now,availableAt(s,c,st),ownBusy)+travelMin(c.location,bay)*MINUTE;
    const busy=s.stops.find(x=>x.bayId===r.bayId&&x.id!==st.id&&x.status==='servicing'&&(x.expectedDeparture??r.start)>r.start-CONFIG.BUFFER_MIN*MINUTE);
    const sensor=s.sensors.find(x=>x.bayId===r.bayId)!;
    let type='';let minutes=0;
    if(!legal(s,r.bayId,r.start,r.end,st)) type='closure';
    else if(busy) {type='overstay';minutes=Math.ceil(((busy.expectedDeparture??s.now)-r.start)/MINUTE)+CONFIG.BUFFER_MIN;}
    else if(sensor.healthy&&sensor.occupied&&!s.stops.some(x=>x.bayId===r.bayId&&x.status==='servicing')&&!s.external.some(e=>e.bayId===r.bayId&&e.status==='active')) type='occupied';
    else if(st.status!=='servicing'&&arrival>r.start+MINUTE) {type='late';minutes=Math.ceil((arrival-r.start)/MINUTE);}
    if(type) out.push({id:`prediction:${r.id}`,reservationId:r.id,type,expectedMinutes:Math.max(0,minutes)});
  }return out;
}

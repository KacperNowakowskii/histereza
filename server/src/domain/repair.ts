import type { State, Prediction, Stop } from '@histereza/shared/types';
import { availableAt, paused } from './courierAvailability';
import { CONFIG, MINUTE } from '@histereza/shared/config';
import { available, findSlot, legal } from './calendar';
import { travelMin } from './geo';
import { priorityEligible } from './priorityGroups';
function repairDraft(s: State, prediction: Prediction) {
  const r=s.reservations.find(r=>r.id===prediction.reservationId)!;const stop=s.stops.find(st=>st.id===r.stopId)!;
  const route=s.routes.find(rt=>rt.id===stop.routeId)!;const c=s.couriers.find(c=>c.id===route.courierId)!;
  if(!s.online||!c.online)return false;
  if(stop.status==='servicing'||stop.status==='done')return false;
  const forced=['closure','occupied'].includes(prediction.type); const key=r.id;
  if(!forced) {
    s.candidateSince[key]??=s.now;
    if(s.now-s.candidateSince[key]<CONFIG.HYSTERESIS_MIN*MINUTE)return false;
    if(s.changes.filter(x=>x.routeId===route.id&&!x.forced&&x.appliedAt>s.now-60*MINUTE).length>=CONFIG.MAX_CHANGES_PER_HOUR)return false;
  }
  const before={...r,deliveryIds:[...r.deliveryIds]};
  const earliest=Math.max(s.now+travelMin(c.location,s.bays.find(b=>b.id===stop.bayId)!)*MINUTE,availableAt(s,c,stop),r.start+Math.max(0,prediction.expectedMinutes)*MINUTE,stop.notBefore??0);
  let result:{bayId:string;start:number;end:number}|undefined;let method='';
  if(prediction.type==='late'&&earliest-r.start<=CONFIG.BUFFER_MIN*MINUTE) {
    const end=earliest+stop.plannedServiceMin*MINUTE;
    if(s.sensors.find(x=>x.bayId===r.bayId)?.healthy&&legal(s,r.bayId,earliest,end,stop)&&available(s,r.bayId,earliest,end,r.id)) {result={bayId:r.bayId,start:earliest,end};method='Przesunięcie w buforze';}
  }
  if(!result&&!stop.frozen&&c.status==='gate'&&!paused(s,c)&&(!c.targetStopId||c.targetStopId===stop.id)) {
    const other=s.stops.filter(st=>st.routeId===route.id&&st.id!==stop.id&&st.status==='pending'&&(!st.notBefore||st.notBefore<=s.now)&&priorityEligible(s,st)).sort((a,b)=>a.plannedArrival-b.plannedArrival)[0];
    if(other) { c.targetStopId=other.id;method='Zmiana kolejności własnych punktów'; }
  }
  if(!result) {
    const duration=stop.plannedServiceMin*MINUTE;const start=prediction.type==='late'?earliest:Math.max(s.now+travelMin(c.location,s.bays.find(b=>b.id===stop.bayId)!)*MINUTE,r.start,availableAt(s,c),stop.notBefore??0);
    const twin=stop.eligibleBayIds.find(id=>id!==r.bayId&&s.bays.find(b=>b.id===id)?.groupId===stop.bayGroupId&&legal(s,id,start,start+duration,stop)&&available(s,id,start,start+duration,r.id)&&s.sensors.find(x=>x.bayId===id)?.healthy&&!s.sensors.find(x=>x.bayId===id)?.occupied);
    if(twin) {result={bayId:twin,start,end:start+duration};method ||= 'Miejsce bliźniacze';}
  }
  if(!result) { const blocked=prediction.type==='occupied'?r.bayId:undefined;const candidate:Stop={...stop,eligibleBayIds:stop.eligibleBayIds.filter(id=>id!==blocked)};result=findSlot(s,candidate,earliest,4,r.id);method ||= 'Najbliższy późniejszy legalny slot'; }
  if(result&&result.bayId===r.bayId&&result.start===r.start)return false;
  r.version++;
  if(result) {Object.assign(r,result);stop.bayId=result.bayId;stop.plannedArrival=result.start;r.status='confirmed';stop.status=stop.frozen?'driving':'pending';}
  else {r.status='suspended';stop.status=stop.frozen?'driving':'waiting';method='Oczekiwanie na legalną pojemność';}
  s.changes.push({id:`change${s.changes.length+1}`,routeId:route.id,cause:`${prediction.type}: ${method}`,before,after:{...r},appliedAt:s.now,acknowledged:false,forced});
  s.notifications.push({id:`notification${s.notifications.length+1}`,userId:c.userId,text:`System: ${method}. Cel ${stop.frozen?'pozostaje zamrożony': 'zaktualizowany'}.`,ts:s.now});
  s.notifications.push({id:`notification${s.notifications.length+1}`,userId:'operator',text:`Automatyczna naprawa ${r.id}: ${method}`,ts:s.now});
  s.events.push({id:`event${s.events.length+1}`,type:'plan-change',actorId:'system',payload:{before,after:{...r},reason:method},ts:s.now});
  delete s.candidateSince[key]; return true;
}
export function repairPlan(s:State,prediction:Prediction){const next=structuredClone(s);const changed=repairDraft(next,prediction);return {next,changed};}

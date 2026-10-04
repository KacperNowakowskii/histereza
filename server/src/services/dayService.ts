import type { State } from '@histereza/shared/types';
import { predict } from '../domain/predictor';
import { repair } from './repairService';
import { paused } from '../domain/courierAvailability';
import { CONFIG, MINUTE } from '@histereza/shared/config';
import { reasonSchema } from '@histereza/shared/schemas';
import { canDrive } from '../domain/gate';
import { gate } from './gateService';
import { presence } from '../domain/presence';
import { vehicleReason } from '../domain/vehicles';
import { distance } from '../domain/geo';
import { legal } from '../domain/calendar';
export function event(s:State,type:string,actorId:string,payload:unknown) {s.events.push({id:`event${s.events.length+1}`,type,actorId,payload,ts:s.now});}
export function notify(s:State,userId:string,text:string) {s.notifications.push({id:`notification${s.notifications.length+1}`,userId,text,ts:s.now});}
export function incident(s:State,type:string,bayId:string,evidence:unknown) {if(!s.incidents.some(i=>i.type===type&&i.bayId===bayId&&i.status==='open')) {s.incidents.push({id:`incident${s.incidents.length+1}`,type,bayId,evidence,status:'open',affectsHistory:false});notify(s,'operator',`Incydent: ${type} — ${bayId}`);event(s,'incident','system',{type,bayId,evidence});}}
export function courierAction(s:State,id:string,action:string,vehicleId?:string,reason?:string,minutes?:number) {
  const c=s.couriers.find(c=>c.id===id);if(!c)throw new Error('Nieznany kurier');
  if(!s.online||!c.online)throw new Error('Brak sieci — brak nowych rezerwacji i kar');
  const route=s.routes.find(r=>r.courierId===id&&r.date===s.planningDate);if(!route)throw new Error('Brak planu kuriera');
  let stop=s.stops.find(st=>st.id===c.targetStopId);
  const res=()=>s.reservations.find(r=>r.stopId===stop?.id&&r.status==='confirmed');
  if(c.status==='driving'&&!['arrive','ack','plan-break','plan-fuel'].includes(action))throw new Error('W trakcie jazdy dostępne jest tylko przybycie');
  if (paused(s,c) && !['finish-break','ack'].includes(action)) throw new Error('Kurier jest czasowo niedostępny: przerwa lub bufor');
  if(action==='problem') {
    if(c.status!=='servicing'||!stop)throw new Error('Problem zgłaszasz przy aktualnie obsługiwanym punkcie');
    if(!['occupied','extended-unloading'].includes(reason ?? ''))throw new Error('Nieznana przyczyna problemu');
    stop.expectedDeparture=Math.max(s.now,stop.expectedDeparture ?? s.now)+10*MINUTE;
    incident(s,reason==='occupied'?'Miejsce zajęte — zgłoszenie kuriera':'Przedłużony rozładunek',stop.bayId,{courierId:id,stopId:stop.id,reason,expectedDeparture:stop.expectedDeparture});
    notify(s,c.userId,'Problem zapisany. Przewidywany koniec obsługi przesunięto o 10 minut. System analizuje przyszłe konflikty.');
  } else if(action==='plan-break'||action==='plan-fuel') {
    if(!stop||!['gate','driving','servicing'].includes(c.status)||stop.status==='done')throw new Error('Zaplanuj przerwę po aktualnym punkcie');
    if(c.pause)throw new Error('Przerwa jest już zaplanowana lub trwa');
    if(![5,10,15,20,30].includes(minutes ?? 0))throw new Error('Wybierz czas 5, 10, 15, 20 lub 30 minut');
    c.pause={kind:action==='plan-fuel'?'fuel':'break',minutes:minutes!,afterStopId:stop.id,phase:'planned'};
  } else if(action==='finish-break') {
    if(c.pause?.phase!=='active')throw new Error('Brak aktywnej przerwy');
    c.pause.phase='buffer';c.pause.resumeAt=s.now+5*MINUTE;c.readyAt=Math.max(c.readyAt,c.pause.resumeAt);delete c.targetStopId;
  } else if(action==='vehicle') {
    if(c.status!=='idle')throw new Error('Pojazd wybierasz przed wyjazdem');
    if(vehicleId!==route.vehicleId)throw new Error('Pojazd przypisała firma; po zamknięciu dnia można go tylko potwierdzić');
    const v=s.vehicles.find(v=>v.id===vehicleId&&v.orgId===c.orgId);if(!v)throw new Error('Nieznany pojazd firmy');
    const ds=s.deliveries.filter(d=>d.courierId===id&&d.date===route.date);const why=vehicleReason(s,v,ds);if(why)throw new Error(why);
    const old=route.vehicleId;route.vehicleId=v.id;
    if(s.stops.filter(st=>st.routeId===route.id).some(st=>{const r=s.reservations.find(r=>r.stopId===st.id&&r.status==='confirmed');return r&&!legal(s,r.bayId,r.start,r.end,st);})){route.vehicleId=old;throw new Error('Pojazd nie pasuje do przydzielonych miejsc');}
    c.vehicleId=v.id;ds.forEach(d=>d.vehicleId=v.id);s.reservations.filter(r=>r.stopId&&s.stops.find(st=>st.id===r.stopId)?.routeId===route.id).forEach(r=>{r.vehicleId=v.id;r.version++;});
  } else if(action==='load') {if(c.status!=='idle'||!c.vehicleId)throw new Error('Najpierw wybierz pojazd');c.loaded=true;}
  else if(action==='depart') {if(!c.loaded||c.status!=='idle')throw new Error('Potwierdź załadunek');c.readyAt=s.now;c.status='gate';stop=gate(s,id);}
  else if(action==='drive') {if(c.status!=='gate'||!stop||!canDrive(s,stop,c.readyAt))throw new Error('Poczekaj na legalny slot / koniec przerwy');c.status='driving';stop.status='driving';stop.frozen=true;}
  else if(action==='arrive') {
    if(c.status!=='driving'||!stop)throw new Error('Nie jesteś w drodze');const r=res();if(!r||s.now<r.start||s.now>=r.end)throw new Error('Przybycie wymaga aktywnego slotu — poczekaj na naprawę');
    const bay=s.bays.find(b=>b.id===stop!.bayId)!;const sensor=s.sensors.find(x=>x.bayId===bay.id)!;const p=presence(c.location,bay,sensor,true,c.online&&s.online,s.now);
    if(!p.present) {if(p.reason==='Zajęte bez kuriera')incident(s,p.reason,bay.id,{gps:c.location,sensor});throw new Error(p.reason);}
    c.status='servicing';stop.status='servicing';stop.actualArrival=s.now;stop.expectedDeparture=s.now+stop.plannedServiceMin*MINUTE;
  } else if(action==='deliver') {
    if(c.status!=='servicing'||!stop)throw new Error('Potwierdź przybycie');
    stop.deliveryIds.forEach(id=>{const d=s.deliveries.find(d=>d.id===id)!;if(d.status!=='closed')d.status='delivered';});
  } else if(action==='closed') {
    if(c.status!=='servicing'||!stop)throw new Error('Zgłoszenie tylko przy lokalu');
    const ds=stop.deliveryIds.map(id=>s.deliveries.find(d=>d.id===id)!);
    if(ds.some(d=>distance(c.location,s.businesses.find(b=>b.id===d.businessId)!.entryPoint)>75))throw new Error('GPS nie potwierdza obecności przy lokalu');
    ds.forEach(d=>{d.status='closed';d.statusReason='Lokal zamknięty';notify(s,d.businessId,'Kurier przy lokalu: punkt zamknięty.');});
  } else if(action==='leave') {
    if(c.status!=='servicing'||!stop||stop.deliveryIds.some(id=>!['delivered','closed'].includes(s.deliveries.find(d=>d.id===id)!.status)))throw new Error('Najpierw zakończ doręczenia');
    const sensor=s.sensors.find(x=>x.bayId===stop!.bayId)!;if(!sensor.healthy||sensor.occupied||s.now-sensor.ts>2*MINUTE)throw new Error('Wyjazd wymaga świeżego odczytu: miejsce wolne');
    stop.actualDeparture=s.now;stop.status='done';stop.frozen=false;const r=res();if(r){r.end=Math.max(r.start+MINUTE,s.now);r.status='completed';r.version++;}
    const excluded=stop.deliveryIds.some(id=>s.deliveries.find(d=>d.id===id)!.status==='closed')||s.incidents.some(i=>i.bayId===stop!.bayId&&i.status==='open');
    for(const id of stop.deliveryIds) {const d=s.deliveries.find(d=>d.id===id)!;s.history.push({businessId:d.businessId,bayId:stop.bayId,cargoType:d.cargoType,durationMin:Math.max(1,(s.now-(stop.actualArrival??s.now))/MINUTE/stop.deliveryIds.length),excluded});}
    const rest=route.breaks.find(b=>b.afterStopId===stop!.id)?.minutes??0;c.readyAt=s.now+rest*MINUTE;c.status='gate';
    if(c.pause?.phase==='planned'&&c.pause.afterStopId===stop.id) {c.pause.phase='active';c.pause.expectedEnd=s.now+c.pause.minutes*MINUTE;delete c.targetStopId;}
    gate(s,id);
  } else if(action==='ack') {s.changes.filter(x=>x.routeId===route.id).forEach(x=>x.acknowledged=true);}
  else if(action==='cannot') {
    if(c.status!=='gate'||!stop)throw new Error('Powód można podać w bramie decyzyjnej');const parsed=reasonSchema.parse(reason);
    if(parsed==='break')throw new Error('Użyj Dodaj przerwę — najwcześniej po zakończeniu aktualnego punktu');
    c.constraints.push(parsed);
    if(parsed==='vehicle-failure') {c.readyAt=s.now+60*MINUTE;stop.notBefore=c.readyAt;}
    if(parsed==='blocked')stop.eligibleBayIds=stop.eligibleBayIds.filter(id=>id!==stop!.bayId);
    notify(s,c.userId,`Ograniczenie przyjęte: ${parsed}. System przeliczy plan.`);
  } else throw new Error('Nieznana czynność');
  event(s,`courier:${action}`,id,{vehicleId,reason,minutes,stopId:stop?.id});
  if(['problem','plan-break','plan-fuel','finish-break'].includes(action)) {s.predictions=predict({...s,reservations:s.reservations.filter(r=>r.stopId&&s.stops.find(st=>st.id===r.stopId)?.routeId&&s.routes.find(rt=>rt.id===s.stops.find(st=>st.id===r.stopId)!.routeId)?.date===s.planningDate)});for(const p of s.predictions)repair(s,p);}
  return s.couriers.find(c=>c.id===id)!;
}

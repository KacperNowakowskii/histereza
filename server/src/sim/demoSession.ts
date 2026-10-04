import { randomUUID } from 'node:crypto';
import type { State, Courier, Stop } from '@histereza/shared/types';
import type { DisruptionKind, SimulationView, SimulationRecord } from '@histereza/shared/simulation';
import { deliverySchemaFor } from '@histereza/shared/schemas';
import { MINUTE } from '@histereza/shared/config';
import { demoCatalog } from '../db/demoSeed';
import { at } from './clock';
import { saveDelivery } from '../services/deliveryService';
import { closeDueDeliveryDays } from '../services/deliveryCutoff';
import { courierAction, event } from '../services/dayService';
import { tick } from './simulator';
import { predict } from '../domain/predictor';
import { repair } from '../services/repairService';
import { canDrive } from '../domain/gate';
import { travelMin } from '../domain/geo';
import { SIMULATION_CONFIG } from './demoConfig';
import type { ScenarioFile } from './scenarioFiles';

const labels:Record<DisruptionKind,string>={delay:'Opóźnienie',traffic:'Korek',overstay:'Przedłużony rozładunek',occupied:'Miejsce zajęte',break:'Planowana przerwa',fuel:'Planowane tankowanie'};
export function scenarioState(file: ScenarioFile, selectedCourier='courier1') {
  const s=file.initialState?structuredClone(file.initialState):demoCatalog();
  if(file.initialState){const schema=deliverySchemaFor(s);s.deliveries.forEach(d=>schema.parse(d));s.now=at(file.startDate,file.startTime);closeDueDeliveryDays(s);return s;}
  s.now=at(file.startDate,'00:00')-7*60*MINUTE;
  const active=new Set(['courier1','courier2','courier6','courier7','courier10','courier14','courier17',selectedCourier]);
  for(const c of s.couriers.filter(c=>active.has(c.id))) {
    if(file.positions?.[c.id])c.location=structuredClone(file.positions[c.id]);
    const vehicle=s.vehicles.find(v=>v.orgId===c.orgId&&v.id===c.vehicleId)!,model=s.models.find(m=>m.id===vehicle.vehicleModelId)!;
    const businesses=s.businesses.filter(b=>b.orgId===c.orgId&&b.workingHours[0].from<='08:00'&&s.links.some(l=>l.businessId===b.id&&s.bays.some(bay=>bay.id===l.bayId&&bay.lengthM>=model.lengthM&&bay.widthM>=model.widthM)));
    for(let i=0;i<file.deliveriesPerCourier;i++)saveDelivery(s,c.orgId,{externalRef:`SIM-${c.id}-${i+1}`,date:file.startDate,cargoType:'standard',businessId:businesses[i%businesses.length].id,vehicleId:vehicle.id,courierId:c.id,priority:0});
  }
  s.now=at(file.startDate,file.startTime);closeDueDeliveryDays(s);s.sensors.forEach(sensor=>sensor.ts=s.now);
  for(const c of s.couriers) {const route=s.routes.find(r=>r.courierId===c.id);if(!route)continue;courierAction(s,c.id,'vehicle',route.vehicleId);courierAction(s,c.id,'load');courierAction(s,c.id,'depart');}
  return s;
}
export class DemoSession {
  readonly id=randomUUID(); private initial:State; state:State; running=false; records:SimulationRecord[]=[];
  private randomState:number; private start:number; private cooldown=new Map<string,number>(); private fired=new Set<number>();
  private blocked=new Map<string,number>(); private delays=new Map<string,number>();
  private serviceExtensions=new Map<string,number>();
  private legs=new Map<string,{stopId:string;bayId:string;start:number;duration:number;from:{lat:number;lng:number}}>();
  private lastPrediction=new Map<string,string>();
  constructor(readonly file:ScenarioFile, readonly mode:'scenario'|'random', readonly orgId:string, readonly courierId:string, readonly randomSeed=1) {
    this.initial=scenarioState(file,courierId);this.state=structuredClone(this.initial);this.start=this.state.now;this.randomState=randomSeed>>>0;
    if(!this.state.couriers.some(c=>c.id===courierId&&c.orgId===orgId))throw new Error('Kurier nie należy do wybranej firmy');
  }
  view():SimulationView {return structuredClone({id:this.id,mode:this.mode,scenarioId:this.file.id,running:this.running,state:this.state,records:this.records});}
  reset(){this.state=structuredClone(this.initial);this.records=[];this.running=false;this.randomState=this.randomSeed>>>0;this.cooldown.clear();this.fired.clear();this.blocked.clear();this.delays.clear();this.serviceExtensions.clear();this.legs.clear();this.lastPrediction.clear();}
  private random(){this.randomState=(Math.imul(1664525,this.randomState)+1013904223)>>>0;return this.randomState/4294967296;}
  private log(courierId:string,kind:string,text:string,stopId?:string,minutes?:number,reaction?:string){this.records.push({id:`sim-event-${this.records.length+1}`,ts:this.state.now,courierId,kind,text,stopId,minutes,reaction});event(this.state,'simulation:'+kind,courierId,{text,stopId,minutes,reaction});}
  private disrupt(kind:DisruptionKind,minutes:number,courierId:string):boolean {
    const s=this.state,c=s.couriers.find(c=>c.id===courierId);if(!c||c.status==='finished'||c.pause?.phase==='active'||c.pause?.phase==='buffer')return false;
    const st=s.stops.find(st=>st.id===c.targetStopId);if(!st)return false;
    if(kind==='overstay') {st.expectedDeparture=Math.max(s.now,st.expectedDeparture??st.plannedArrival+st.plannedServiceMin*MINUTE)+minutes*MINUTE;if(c.status!=='servicing')this.serviceExtensions.set(st.id,(this.serviceExtensions.get(st.id)??0)+minutes);}
    else if(kind==='break'||kind==='fuel') {if(c.pause)return false;courierAction(s,c.id,kind==='fuel'?'plan-fuel':'plan-break',undefined,undefined,minutes);}
    else if(kind==='occupied') {this.blocked.set(st.bayId,s.now+minutes*MINUTE);const sensor=s.sensors.find(x=>x.bayId===st.bayId)!;sensor.occupied=true;sensor.ts=s.now;if(st.status==='servicing')st.expectedDeparture=Math.max(s.now,st.expectedDeparture??s.now)+minutes*MINUTE;}
    else {this.delays.set(c.id,Math.max(this.delays.get(c.id)??s.now,s.now)+minutes*MINUTE);c.readyAt=Math.max(c.readyAt,s.now)+minutes*MINUTE;const leg=this.legs.get(c.id);if(leg)leg.start+=minutes*MINUTE;if(c.status==='servicing')st.expectedDeparture=Math.max(s.now,st.expectedDeparture??s.now)+minutes*MINUTE;}
    this.log(c.id,kind,`${labels[kind]} +${minutes} min`,st.id,minutes);return true;
  }
  private disturbances() {
    const elapsed=Math.floor((this.state.now-this.start)/MINUTE);
    if(this.mode==='scenario') this.file.events.forEach((e,index)=>{if(!this.fired.has(index)&&elapsed>=e.minute){const id=e.courierId??this.courierId;if(!this.disrupt(e.kind,e.duration,id))this.log(id,'skipped',`Pominięto ${labels[e.kind]}: brak aktywnego punktu lub trwa przerwa`,undefined,e.duration);this.fired.add(index);}});
    else for(const c of this.state.couriers) {
      // Losowania przyczyn są niezależne; cooldown przepuszcza najwyżej jedno zdarzenie.
      const candidates=(Object.keys(SIMULATION_CONFIG.probabilities) as DisruptionKind[]).filter(kind=>this.random()<SIMULATION_CONFIG.probabilities[kind]);
      if(this.state.now-(this.cooldown.get(c.id)??-Infinity)<SIMULATION_CONFIG.cooldownMinutes*MINUTE)continue;
      for(const kind of candidates) {const [min,max]=SIMULATION_CONFIG.durationMinutes[kind];let duration=min+Math.floor(this.random()*(max-min+1));if(kind==='break'||kind==='fuel'){const durations=[5,10,15,20,30].filter(n=>n>=min&&n<=max);duration=durations[Math.floor(this.random()*durations.length)]??5;};if(this.disrupt(kind,duration,c.id)){this.cooldown.set(c.id,this.state.now);break;}}
    }
  }
  private act(c:Courier, action:string, vehicleId?:string) {
    // Nie omijamy walidacji domenowej. Oczekiwanie na slot/GPS jest normalną częścią demo.
    try {courierAction(this.state,c.id,action,vehicleId);return true;}catch(error){const text=error instanceof Error?error.message:'Oczekiwanie';if(this.records.at(-1)?.text!==text)this.log(c.id,'waiting',text,c.targetStopId);return false;}
  }
  private move(c:Courier) {
    const s=this.state;
    if(c.status==='idle'){const route=s.routes.find(r=>r.courierId===c.id&&r.date===s.planningDate);if(route&&this.act(c,'vehicle',route.vehicleId)&&this.act(c,'load'))this.act(c,'depart');return;}
    if((this.delays.get(c.id)??0)>s.now)return;
    if(c.pause?.phase==='active'){if(s.now>=(c.pause.expectedEnd??Infinity))this.act(c,'finish-break');return;}
    if(c.pause?.phase==='buffer')return;
    const st=s.stops.find(st=>st.id===c.targetStopId),bay=s.bays.find(b=>b.id===st?.bayId);
    if(!st||!bay)return;
    if(c.status==='gate') {if(canDrive(s,st,c.readyAt)){this.act(c,'drive');this.legs.delete(c.id);}return;}
    if(c.status==='driving') {
      let leg=this.legs.get(c.id);if(!leg||leg.stopId!==st.id||leg.bayId!==bay.id){leg={stopId:st.id,bayId:bay.id,start:s.now,duration:travelMin(c.location,bay)*MINUTE,from:{...c.location}};this.legs.set(c.id,leg);}
      const fraction=Math.max(0,Math.min(1,(s.now-leg.start)/leg.duration));c.location={lat:leg.from.lat+(bay.lat-leg.from.lat)*fraction,lng:leg.from.lng+(bay.lng-leg.from.lng)*fraction};
      const r=s.reservations.find(r=>r.stopId===st.id&&r.status==='confirmed');
      if(fraction===1&&r&&s.now>=r.start&&s.now<r.end&&!this.blocked.has(bay.id)&&!s.stops.some(other=>other.id!==st.id&&other.bayId===bay.id&&other.status==='servicing')){const sensor=s.sensors.find(x=>x.bayId===bay.id)!;sensor.occupied=true;sensor.ts=s.now;if(this.act(c,'arrive')){st.expectedDeparture!+=(this.serviceExtensions.get(st.id)??0)*MINUTE;this.serviceExtensions.delete(st.id);this.log(c.id,'arrival','Potwierdzono przybycie',st.id);}}
    } else if(c.status==='servicing'&&s.now>=(st.expectedDeparture??Infinity)) {
      if(!this.act(c,'deliver'))return;const sensor=s.sensors.find(x=>x.bayId===bay.id)!;sensor.occupied=false;sensor.ts=s.now;
      if(this.act(c,'leave'))this.log(c.id,'completed','Punkt zakończony',st.id);
    }
  }
  advance(minutes:number) {
    if(!Number.isInteger(minutes)||minutes<1||minutes>120)throw new Error('Wybierz od 1 do 120 minut');
    if(!this.running)return this.view();
    for(let i=0;i<minutes;i++) {
      const changes=this.state.changes.length;
      for(const [bayId,until] of this.blocked)if(until<=this.state.now+MINUTE){this.blocked.delete(bayId);const sensor=this.state.sensors.find(x=>x.bayId===bayId)!;sensor.occupied=this.state.stops.some(st=>st.bayId===bayId&&st.status==='servicing');}
      tick(this.state,1);this.disturbances();
      const predictions=predict(this.state);this.state.predictions=predictions;
      for(const p of predictions){const st=this.state.stops.find(st=>st.id===this.state.reservations.find(r=>r.id===p.reservationId)?.stopId);const route=this.state.routes.find(r=>r.id===st?.routeId);if(!st||!route)continue;const key=`${p.type}:${p.expectedMinutes}`;if(this.lastPrediction.get(p.reservationId)!==key){this.log(route.courierId,'conflict',`Wykryto konflikt: ${p.type} +${p.expectedMinutes} min`,st.id,p.expectedMinutes,'Propozycja: późniejszy legalny slot lub miejsce alternatywne; zachowanie kuriera i zamrożonego celu');this.lastPrediction.set(p.reservationId,key);}repair(this.state,p);}
      for(const change of this.state.changes.slice(changes)){const route=this.state.routes.find(r=>r.id===change.routeId)!;const before=change.before as {start?:number;stopId?:string},after=change.after as {start?:number;bayId?:string};this.log(route.courierId,'proposal',`Proponowana zmiana: ${change.cause}`,before.stopId,Math.round(((after.start??0)-(before.start??0))/MINUTE),`Nowy slot: ${after.start ? new Date(after.start).toISOString() : 'oczekiwanie'}; miejsce ${after.bayId}. Dostawy pozostają u tego kuriera.`);this.log(route.courierId,'repair',`Zastosowano: ${change.cause}`,before.stopId,Math.round(((after.start??0)-(before.start??0))/MINUTE),`Wpływ na plan: slot przesunięty o ${Math.round(((after.start??0)-(before.start??0))/MINUTE)} min; miejsce ${after.bayId}. Przypisanie kuriera bez zmian.`);}
      for(const c of this.state.couriers)this.move(c);
    }
    return this.view();
  }
}

import type { State } from '@histereza/shared/types';
import { MINUTE } from '@histereza/shared/config';
import { shiftDay } from '@histereza/shared/deliveryDates';
import { seed } from './seed';
import { saveBusiness, saveVehicle } from '../services/catalogService';
import { saveDelivery } from '../services/deliveryService';
import { closeDueDeliveryDays } from '../services/deliveryCutoff';
import { at } from '../sim/clock';
import { legal } from '../domain/calendar';
export const DEMO_DAY='2026-10-07';
export const DEMO_DAYS=[{offset:-3,count:10},{offset:-2,count:28},{offset:-1,count:32},{offset:0,count:36},{offset:1,count:36},{offset:2,count:28},{offset:3,count:28}];
/** Rozbudowane dane demonstracyjne. Mały seed pozostaje izolowaną fixture testów domenowych. */
export function demoCatalog():State {
  const s=seed();s.now=at(shiftDay(DEMO_DAY,-4),'17:00');s.planningDate=shiftDay(DEMO_DAY,-4);s.organizations=[];s.users=[];s.couriers=[];s.vehicles=[];s.models=[];s.businesses=[];s.links=[];s.history=[];s.events=[];
  const names=['Wisła Logistyka','Kazimierz Express','Małopolska Chłodnia','Krakowski Kurier','Poranny Transport'];
  const courierCounts=[5,4,4,3,2],vehicleCounts=[6,5,5,4,4];
  for(let i=0;i<6;i++){const template=s.bays[(i*2)%8],id=`bay${i+9}`;s.bays.push({...template,id,name:['Plac Nowy — zaplecze','Szewska — dostawy','Podzamcze — hotel','Plac Nowy — piekarnia','Szewska — pasaż','Podzamcze — chłodnia'][i],lat:template.lat+.00035,lng:template.lng+.0002,lengthM:i===5?6.8:6.4,widthM:2.4});s.groups.find(g=>g.id===template.groupId)!.bayIds.push(id);s.schedules.push({bayId:id,day:'*',from:'00:00',to:'00:00',function:'deliveries'});s.sensors.push({bayId:id,ts:s.now,occupied:false,healthy:true});}
  let courierIndex=0,vehicleIndex=0;
  for(let o=0;o<5;o++){
    const orgId=`org${o+1}`;s.organizations.push({id:orgId,name:names[o],type:'carrier',size:o<2?'large':'small'});
    for(let v=0;v<vehicleCounts[o];v++){
      const n=++vehicleIndex,large=n===22,cold=v===0||n===9||n===16,bad=n>=23;
      saveVehicle(s,orgId,{id:`vehicle${n}`,registrationNumber:`KR ${['WL','KE','MC','KK','PT'][o]}${String(v+1).padStart(3,'0')}`,fuelType:bad?(n===23?'diesel':'petrol'):v%3===1?'electric':v%3===2?'petrol':'diesel',emissionStandard:bad?2:6,productionYear:bad?2004:2019+(n%6),hasCooling:cold,dimensionsVerified:true,model:{name:large?'Iveco Daily L4 — demo: ograniczone miejsca':bad?'Starszy dostawczak — demo SCT':cold?'Mercedes Sprinter — chłodnia':['Renault Kangoo','Ford Transit Custom','VW Crafter'][v%3],lengthM:large?6.5:4.3+(v%3)*.5,widthM:large?2.35:1.8+(v%3)*.1,heightM:cold?2.65:2.1+(v%3)*.2,maxLoadKg:large?1800:cold?1100:900,gvwKg:large?4500:3500}});
    }
    const vehicles=s.vehicles.filter(v=>v.orgId===orgId);
    for(let k=0;k<courierCounts[o];k++){const n=++courierIndex;s.users.push({id:`user${n}`,orgId,role:'courier'});s.couriers.push({id:`courier${n}`,userId:`user${n}`,orgId,regionIds:['A','B','C'],status:'idle',location:{lat:50.054+o*.0002,lng:19.944-k*.0001},vehicleId:vehicles[k].id,loaded:false,online:true,readyAt:at(DEMO_DAY,'07:00'),constraints:[]});}
  }
  const titles=['Restauracja Pod Lipą','Kawiarnia Ziarno','Piekarnia Poranna','Delikatesy Sąsiedzkie','Apteka Zielona','Hotel Nad Wisłą','Sklep Papier i Pióro','Pracownia Krawiecka','Bistro Rynek'];
  const hours=[['07:00','21:00'],['07:30','18:00'],['06:30','14:00'],['08:00','22:00'],['08:30','19:00'],['07:00','23:00'],['09:00','18:00'],['08:00','16:00'],['07:00','15:00']];
  for(let o=0;o<5;o++)for(let b=0;b<9;b++){
    const id=`business${o*9+b+1}`,group=s.groups[b%3],bay=s.bays.find(b=>b.id===group.bayIds[0])!;
    saveBusiness(s,`org${o+1}`,{id,name:`${titles[b]} — ${['Kazimierz','Stare Miasto','Podzamcze','Kleparz','Zwierzyniec'][o]}`,entryPoint:{lat:bay.lat+.00005*(1+b%3),lng:bay.lng+.00003*(1+o)},workingHours:[{from:hours[b][0],to:hours[b][1]}],unloadingConditions:b===5?'Recepcja hotelu, dostawy od zaplecza':b===4?'Odbiór przez farmaceutę, domofon':'Wejście od zaplecza; odbiór przy drzwiach',unattendedDropAllowed:b===7,bayIds:group.bayIds});
  }
  for(let i=0;i<500;i++){const b=s.businesses[i%45],links=s.links.filter(l=>l.businessId===b.id),cargo=['standard','fresh','cold'] as const;const wave=[-2,0,1,-1,3,0,2,-1,6,1][Math.floor(i/45)%10];s.history.push({businessId:b.id,bayId:links[Math.floor(i/90)%links.length].bayId,cargoType:cargo[Math.floor(i/45)%3],durationMin:Math.max(2,5+(i%4)+wave),excluded:i%37===0});}
  return s;
}
function addDay(s:State,date:string,count:number){
  // Wybrani kurierzy wszystkich firm; pozostali mogą nie mieć dostaw danego dnia.
  const indices=date===shiftDay(DEMO_DAY,2)||date===shiftDay(DEMO_DAY,-1)?[0,1,3,4,7,8,10,12,14,15,16,17]:[0,1,2,5,6,7,9,10,11,13,14,16];let left=count;
  for(let index=0;left>0;index++){
    const c=s.couriers[indices[index%indices.length]],limit=index<3?4:index<9?3:2,amount=Math.min(limit,Math.max(1,left-Math.max(0,indices.length-index-1))),v=s.vehicles.find(v=>v.id===c.vehicleId)!;
    const businesses=s.businesses.filter(b=>b.orgId===c.orgId),pattern=index%4===1?[0,0,0,0]:index===0?[1,2,3,0]:index===3?[1,2,0,0]:index%3===0?[1,1,0,0]:index%4===2?[1,2,0,0]:index%2?[1,0,0,0]:[1,2,0,0];
    for(let k=0;k<amount;k++){
      const priority=amount===1?(index%4===1||[2,8,10].includes(index)?0:1):pattern[k]===3&&amount<3?0:pattern[k];
      // Dwa biznesy z jednej grupy miejsc u kuriera bez priorytetów.
      const b=businesses[s.models.find(m=>m.id===v.vehicleModelId)!.lengthM>6?(k%3)*3:Number(c.id.replace('courier',''))%4===2&&k===0?0:index%4===1?(k%2)*3:(k*2+index)%businesses.length];
      saveDelivery(s,c.orgId,{externalRef:`DEMO-${date}-${c.id}-${k+1}`,date,businessId:b.id,vehicleId:v.id,courierId:c.id,workingHours:Number(c.id.replace('courier',''))%4===2&&k===0?[{from:'08:15',to:b.workingHours[0].to}]:undefined,cargoType:v.hasCooling&&k%3===2?'cold':k%3===1?'fresh':'standard',priority});
    }left-=amount;
  }
}
export function demoSeed():State {
  const s=demoCatalog();
  for(const {offset,count} of DEMO_DAYS){const date=shiftDay(DEMO_DAY,offset);s.now=at(shiftDay(date,-1),'17:00');addDay(s,date,count);
    if(offset<=0){s.now=at(date,'00:00');closeDueDeliveryDays(s);}
    if(offset<0)for(const st of s.stops.filter(st=>s.routes.find(r=>r.id===st.routeId)?.date===date)){
      const r=s.reservations.find(r=>r.stopId===st.id)!;st.status='done';st.frozen=false;const delta=[0,1,-1,2,-2][st.sequence%5];st.actualArrival=r.start+delta*MINUTE;st.actualDeparture=r.end+(st.sequence%3===0?-1:1)*MINUTE;st.expectedDeparture=st.actualDeparture;
      for(const id of st.deliveryIds)s.deliveries.find(d=>d.id===id)!.status='delivered';r.status='completed';
      s.events.push({id:`demo-completed-${st.id}`,type:'demo-delivery-completed',actorId:s.routes.find(rt=>rt.id===st.routeId)!.courierId,ts:st.actualDeparture!,payload:{stopId:st.id,actualArrival:st.actualArrival,actualDeparture:st.actualDeparture,delayMinutes:delta}});
    }
  }
  s.now=at(DEMO_DAY,'08:20');s.planningDate=DEMO_DAY;s.sensors.forEach(sensor=>{sensor.ts=s.now;sensor.occupied=false;});
  for(const c of s.couriers){c.status='idle';c.loaded=false;delete c.targetStopId;const route=s.routes.find(r=>r.courierId===c.id&&r.date===DEMO_DAY);if(!route)continue;const stops=s.stops.filter(st=>st.routeId===route.id).sort((a,b)=>a.sequence-b.sequence),kind=Number(c.id.replace('courier',''))%4;
    if(kind===0)continue;c.loaded=true;
    const completed=stops.findIndex(st=>s.reservations.find(r=>r.stopId===st.id)!.end>s.now);
    const doneCount=completed<0?stops.length:completed;
    for(const st of stops.slice(0,doneCount)){st.status='done';st.actualArrival=st.plannedArrival;st.actualDeparture=st.plannedArrival+st.plannedServiceMin*MINUTE;const r=s.reservations.find(r=>r.stopId===st.id)!;r.status='completed';st.deliveryIds.forEach(id=>s.deliveries.find(d=>d.id===id)!.status='delivered');}
    const target=stops[doneCount];if(!target){c.status='finished';continue;}
    if(doneCount){const previousBay=s.bays.find(b=>b.id===stops[doneCount-1].bayId)!;c.location={lat:previousBay.lat,lng:previousBay.lng};}c.targetStopId=target.id;c.readyAt=s.now;
    const reservation=s.reservations.find(r=>r.stopId===target.id)!;
    if(kind===2&&reservation.start<=s.now&&reservation.end>s.now){c.status='servicing';target.status='servicing';target.frozen=true;target.actualArrival=reservation.start;target.expectedDeparture=reservation.end;const bay=s.bays.find(b=>b.id===target.bayId)!;c.location={lat:bay.lat,lng:bay.lng};s.sensors.find(sensor=>sensor.bayId===bay.id)!.occupied=true;}
    else {c.status=c.id==='courier1'?'gate':'driving';target.status=c.id==='courier1'?'pending':'driving';target.frozen=c.id!=='courier1';const bay=s.bays.find(b=>b.id===target.bayId)!;c.location={lat:(c.location.lat+bay.lat)/2,lng:(c.location.lng+bay.lng)/2};}
  }
  const historical=s.stops.filter(st=>s.routes.find(r=>r.id===st.routeId)!.date<DEMO_DAY);
  const extended=historical.find(st=>{const r=s.reservations.find(r=>r.stopId===st.id)!;const end=r.end+12*MINUTE;return legal(s,r.bayId,r.start,end,st)&&!s.reservations.some(other=>other.id!==r.id&&other.bayId===r.bayId&&r.end<other.end&&end+5*MINUTE>other.start);});
  if(!extended)throw new Error('Brak bezpiecznej historycznej próbki przedłużenia');
  const er=s.reservations.find(r=>r.stopId===extended.id)!;extended.actualDeparture=er.end+12*MINUTE;extended.expectedDeparture=extended.actualDeparture;er.end=extended.actualDeparture;
  const hd=s.deliveries.find(d=>d.id===extended.deliveryIds[0])!;Object.assign(s.history[0],{businessId:hd.businessId,bayId:extended.bayId,cargoType:hd.cargoType,durationMin:extended.plannedServiceMin+12,excluded:true});
  for(const [i,type] of ['Historyczny przedłużony rozładunek +12 min','Historyczne zajęcie miejsca — auto dostawcze','Historyczne zajęcie miejsca — samochód osobowy','Historyczna awaria czujnika — rozwiązana'].entries()){const st=i===0?extended:historical[i];s.incidents.push({id:`demo-incident-${i+1}`,type,bayId:st.bayId,evidence:{stopId:st.id,minutes:i===0?12:7},status:'resolved',resolution:'Obsłużono w dniu dostawy',affectsHistory:false});s.events.push({id:`demo-history-${i+1}`,type:'incident-resolved',actorId:'operator',ts:st.actualDeparture!,payload:{type,stopId:st.id,bayId:st.bayId}});}
  // Kierowca QR: historyczny, zakończony postój w rzeczywistym wolnym odstępie.
  const bay=s.bays[0],start=at(shiftDay(DEMO_DAY,-1),'08:00');
  for(let minute=0;minute<120;minute++){const from=start+minute*MINUTE,to=from+5*MINUTE;if(!legal(s,bay.id,from,to)||s.reservations.some(r=>r.bayId===bay.id&&from<r.end+5*MINUTE&&to+5*MINUTE>r.start))continue;s.external.push({id:'demo-qr',bayId:bay.id,registrationNumber:'KR QR777',start:from,allowedUntil:to,status:'ended'});s.reservations.push({id:'res:demo-qr',bayId:bay.id,externalParkingId:'demo-qr',deliveryIds:[],start:from,end:to,status:'completed',version:1});break;}
  return s;
}

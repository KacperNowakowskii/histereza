import { describe, it, expect } from 'vitest';
import { seed } from '../src/db/seed';
import { at } from '../src/sim/clock';
import { courierAction } from '../src/services/dayService';
import { predict } from '../src/domain/predictor';
import { repair } from '../src/services/repairService';
import { gate } from '../src/services/gateService';
import { availableAt } from '../src/domain/courierAvailability';
import { tick } from '../src/sim/simulator';
import { MINUTE, CONFIG } from '@histereza/shared/config';
import { actionSchema } from '@histereza/shared/schemas';
import { routeView } from '../../client/src/pages/courier/routeView';
import { openDb } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { createApp } from '../src/api/app';
import type { Stop } from '@histereza/shared/types';
function fixture() {
  const s=seed();s.now=at('2026-10-07','08:00');s.planningDate='2026-10-07';s.closedDeliveryDates=[s.planningDate];
  s.routes=[{id:'own',courierId:'courier1',vehicleId:'vehicle1',date:s.planningDate,stopIds:['a','b'],breaks:[],loadingList:['d0','d1']}];
  s.deliveries=[0,1].map(i=>({id:`d${i}`,externalRef:`D${i}`,carrierOrgId:'org1',businessId:'business1',businessName:s.businesses[0].name,date:s.planningDate,cargoType:'standard',courierId:'courier1',vehicleId:'vehicle1',priority:0,status:'planned'}));
  s.stops=['a','b'].map((id,i):Stop=>({id,routeId:'own',sequence:i,bayId:'bay1',bayGroupId:s.bays[0].groupId,deliveryIds:[`d${i}`],plannedArrival:s.now+i*15*MINUTE,plannedServiceMin:10,status:i===0?'servicing':'pending',actualArrival:i===0?s.now:undefined,expectedDeparture:i===0?s.now+10*MINUTE:undefined,frozen:i===0,eligibleBayIds:['bay1']}));
  s.reservations=s.stops.map(st=>({id:`r${st.id}`,bayId:st.bayId,stopId:st.id,vehicleId:'vehicle1',deliveryIds:st.deliveryIds,start:st.plannedArrival,end:st.plannedArrival+10*MINUTE,status:'confirmed',version:1}));
  const c=s.couriers[0];c.status='servicing';c.targetStopId='a';c.location={lat:s.bays[0].lat,lng:s.bays[0].lng};c.readyAt=s.now;c.loaded=true;c.vehicleId='vehicle1';s.sensors.forEach(x=>{x.ts=s.now;x.occupied=false;});return s;
}
function leave(s:ReturnType<typeof fixture>) {courierAction(s,'courier1','deliver');courierAction(s,'courier1','leave');}
describe('Problemy i planowane przerwy kuriera',()=>{
  it.each(['occupied','extended-unloading'])('problem %s tworzy zdarzenie i przyszłą predykcję bez anulowania punktu',reason=>{
    const s=fixture(), original=s.stops[0].expectedDeparture!;courierAction(s,'courier1','problem',undefined,reason);
    expect(s.stops[0].expectedDeparture).toBe(original+10*MINUTE);expect(s.stops[0].status).toBe('servicing');expect(s.events.some(e=>e.type==='courier:problem')).toBe(true);expect(s.predictions.some(p=>p.reservationId==='rb'&&['late','overstay'].includes(p.type))).toBe(true);
    expect(()=>courierAction(s,'courier1','problem',undefined,'invalid')).toThrow('przyczyna');
  });
  it.each([5,10,15,20,30])('planuje %i min po punkcie i informuje predykcję wcześniej',minutes=>{
    const s=fixture();courierAction(s,'courier1','plan-break',undefined,undefined,minutes);const c=s.couriers[0];expect(c.pause?.phase).toBe('planned');expect(c.targetStopId).toBe('a');expect(s.stops[0].status).toBe('servicing');expect(availableAt(s,c,s.stops[1])).toBe(s.now+(10+minutes+5)*MINUTE);expect(s.predictions.some(p=>p.reservationId==='rb')).toBe(true);
    expect(()=>courierAction(s,c.id,'finish-break')).toThrow('aktywnej');expect(()=>courierAction(s,c.id,'plan-fuel',undefined,undefined,5)).toThrow('już');leave(s);expect(s.couriers[0].pause?.phase).toBe('active');expect(s.couriers[0].targetStopId).toBeUndefined();expect(s.stops[0].status).toBe('done');
  });
  it('tankowanie działa także podczas jazdy i nie anuluje celu',()=>{
    const s=fixture(),c=s.couriers[0];c.status='driving';s.stops[0].status='driving';courierAction(s,c.id,'plan-fuel',undefined,undefined,20);expect(s.couriers[0].pause?.kind).toBe('fuel');expect(s.couriers[0].targetStopId).toBe('a');expect(s.stops[0].status).toBe('driving');expect(availableAt(s,s.couriers[0],s.stops[0])).toBe(c.readyAt);
  });
  it('nie wznawia automatycznie po czasie i wymaga pełnych 5 minut bufora',()=>{
    const s=fixture();courierAction(s,'courier1','plan-break',undefined,undefined,5);leave(s);tick(s,6);expect(s.couriers[0].pause?.phase).toBe('active');expect(s.couriers[0].targetStopId).toBeUndefined();expect(()=>courierAction(s,'courier1','drive')).toThrow('niedostępny');expect(routeView(s,s.couriers[0],s.routes[0]).next).toBeUndefined();
    courierAction(s,'courier1','finish-break');const resume=s.now+5*MINUTE;expect(s.couriers[0].pause?.resumeAt).toBe(resume);tick(s,4);expect(s.couriers[0].targetStopId).toBeUndefined();expect(()=>courierAction(s,'courier1','drive')).toThrow('niedostępny');tick(s,1);expect(s.now).toBe(resume);expect(s.couriers[0].pause).toBeUndefined();expect(s.couriers[0].targetStopId).toBe('b');
  });
  it('odrzuca brak punktu, błędne czasy, problem poza obsługą i dawną natychmiastową przerwę',()=>{
    const s=fixture();expect(()=>courierAction(s,'courier1','plan-break',undefined,undefined,7)).toThrow('Wybierz czas');s.couriers[0].status='idle';expect(()=>courierAction(s,'courier1','plan-break',undefined,undefined,5)).toThrow('po aktualnym');expect(()=>courierAction(s,'courier1','problem',undefined,'occupied')).toThrow('obsługiwanym');s.couriers[0].status='gate';expect(()=>courierAction(s,'courier1','cannot',undefined,'break')).toThrow('Dodaj przerwę');
    expect(actionSchema.safeParse({action:'plan-fuel',minutes:7}).success).toBe(false);
  });
  it('naprawa przyszłego slotu uwzględnia przerwę i zachowuje kuriera',()=>{
    const s=fixture(), owners=s.deliveries.map(d=>d.courierId);courierAction(s,'courier1','plan-break',undefined,undefined,30);const expected=availableAt(s,s.couriers[0],s.stops[1]);const p=predict(s).find(p=>p.reservationId==='rb')!;s.candidateSince.rb=s.now-CONFIG.HYSTERESIS_MIN*MINUTE;
    expect(repair(s,p)).toBe(true);expect(s.reservations.find(r=>r.id==='rb')!.start).toBeGreaterThanOrEqual(expected);expect(s.deliveries.map(d=>d.courierId)).toEqual(owners);expect(s.couriers[0].targetStopId).toBe('a');
  });
  it('repozytorium zachowuje plan przerwy, a API waliduje czas i udostępnia nowe akcje',async()=>{
    const db=openDb(':memory:'),repo=new Repo(db,fixture),server=createApp(repo).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    try {const post=(body:unknown)=>fetch(`${base}/api/courier/courier1/action`,{method:'POST',headers:{'content-type':'application/json','x-role':'courier'},body:JSON.stringify(body)});expect((await post({action:'plan-break',minutes:7})).status).toBe(422);expect((await post({action:'plan-fuel',minutes:15})).status).toBe(200);expect(repo.read().couriers[0].pause?.kind).toBe('fuel');expect((await post({action:'problem',reason:'extended-unloading'})).status).toBe(200);new Repo(db,seed);expect(repo.read().couriers[0].pause?.minutes).toBe(15);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();}
  });
});

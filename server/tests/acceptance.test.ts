import { describe,it,expect,afterEach } from 'vitest';
import { seed,sampleCsv } from '../src/db/seed';
import { openDb } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { validateImport } from '../src/domain/importValidation';
import { plan } from '../src/services/planningService';
import { presence } from '../src/domain/presence';
import { fairness } from '../src/domain/fairness';
import { allowedUntil } from '../src/domain/externalParking';
import { vehicleReason,vehicleSct } from '../src/domain/vehicles';
import { tick } from '../src/sim/simulator';
import { repair } from '../src/services/repairService';
import { courierAction } from '../src/services/dayService';
import { at } from '../src/sim/clock';
import { createApp } from '../src/api/app';
import { MINUTE,CONFIG } from '@histereza/shared/config';
import type { Delivery,State,Stop,Reservation } from '@histereza/shared/types';
const makeDelivery=(id:string,courierId='courier1',businessId='business1'):Delivery=>({id,externalRef:id,carrierOrgId:courierId==='courier4'?'org2':'org1',businessId,businessName:`Lokal demonstracyjny ${businessId.slice(8)}`,date:'2026-10-07',cargoType:'standard',priority:0,courierId,vehicleId:courierId==='courier4'?'vehicle4':'vehicle1',status:'imported'});
function fixture() {
  const s=seed();s.deliveries=[makeDelivery('d1'),makeDelivery('d2','courier4')];plan(s,s.planningDate);s.closedDeliveryDates=[s.planningDate];s.now=at(s.planningDate,'07:00');s.sensors.forEach(x=>x.ts=s.now);return s;
}
function setupConflict(driving=false) {
  const s=fixture();const a=s.stops[0],b=s.stops[1];const ra=s.reservations.find(r=>r.stopId===a.id)!,rb=s.reservations.find(r=>r.stopId===b.id)!;
  a.status='servicing';a.actualArrival=ra.start;a.expectedDeparture=rb.start+20*MINUTE;
  rb.bayId=a.bayId;b.bayId=a.bayId;rb.start=ra.end+CONFIG.BUFFER_MIN*MINUTE;rb.end=rb.start+b.plannedServiceMin*MINUTE;b.plannedArrival=rb.start;
  const c=s.couriers.find(c=>c.id==='courier4')!;c.status=driving?'driving':'gate';c.targetStopId=b.id;b.status=driving?'driving':'pending';b.frozen=driving;s.now=ra.start;s.sensors.find(x=>x.bayId===a.bayId)!.occupied=true;
  return {s,a,b,ra,rb,c};
}
describe('Akceptacja T1–T16',()=>{
  it('T1: SQLite atomowo odrzuca równoczesne nakładające się rezerwacje',async()=>{
    const db=openDb(':memory:');const repo=new Repo(db,seed);const r:Reservation={id:'r1',bayId:'bay1',stopId:'s1',vehicleId:'vehicle1',deliveryIds:['d1'],start:1_000_000,end:2_000_000,status:'confirmed',version:1};
    const results=await Promise.allSettled([Promise.resolve().then(()=>repo.mutate(s=>{s.reservations.push(r);})),Promise.resolve().then(()=>repo.mutate(s=>{s.reservations.push({...r,id:'r2'});} ))]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(repo.read().reservations).toHaveLength(1);db.close();
  });
  it('T2: import wymaga kuriera i zachowuje przypisanie firmy',()=>{const s=seed();const csv=sampleCsv(s).split('\r\n').filter((_,i)=>i===0||i===1).join('\r\n');const result=validateImport(s,csv,'org1');expect(result.errors).toEqual([]);expect(result.deliveries[0].courierId).toBe('courier1');expect(validateImport(s,csv.replace('courier1',''),'org1').errors.length).toBeGreaterThan(0);});
  it('T3: spóźniony nie odbiera cudzych praw; system powiadamia',()=>{const s=fixture();const c=s.couriers[0];c.readyAt=s.reservations[0].start+15*MINUTE;const timely={...s.reservations[1]};const onTime=s.couriers.find(c=>c.id==='courier4')!;onTime.status='driving';onTime.targetStopId=s.stops[1].id;s.stops[1].status='driving';s.stops[1].frozen=true;onTime.location=s.bays.find(b=>b.id===timely.bayId)!;tick(s,4);expect(s.changes.length).toBeGreaterThan(0);expect(s.reservations[1]).toMatchObject(timely);expect(s.notifications.length).toBeGreaterThan(0);});
  it('T4: sam czujnik nie zalicza obecności, powstaje incydent',()=>{const s=seed();s.sensors[0].occupied=true;const p=presence({lat:0,lng:0},s.bays[0],s.sensors[0],true,true,s.now);expect(p.present).toBe(false);tick(s);expect(s.incidents.some(i=>i.type==='Zajęte bez kuriera')).toBe(true);});
  it('T5: zamknięcie ulicy wymusza legalne miejsce',()=>{const s=fixture();const st=s.stops[0];s.rules.push({id:'close',type:'closure',target:st.bayId,params:{},validFrom:s.now,validTo:s.now+120*MINUTE});const old=st.bayId;tick(s);expect(st.bayId).not.toBe(old);expect(s.changes[0].forced).toBe(true);});
  it('T6: offline i awaria czujnika nie powodują kar/no-show',()=>{const s=fixture();s.online=false;const original=structuredClone(s.reservations);tick(s,30);expect(s.reservations).toEqual(original);expect(()=>courierAction(s,'courier1','depart')).toThrow('Brak sieci');s.online=true;s.sensors.forEach(x=>x.healthy=false);s.couriers.forEach(c=>c.readyAt=s.now);tick(s);expect(s.reservations.some(r=>r.status==='no-show')).toBe(false);});
  it('T7: raport wykrywa gorszy dostęp małych firm',()=>{const s=fixture();const small=s.reservations.find(r=>r.deliveryIds.includes('d2'))!;small.status='suspended';expect(fairness(s).warning).toBe(true);});
  it('T8: wcześniejsze zakończenie oddaje pojemność z buforem',()=>{const s=fixture();const st=s.stops[0];const c=s.couriers[0];const r=s.reservations[0];s.now=r.start+2*MINUTE;c.status='servicing';c.targetStopId=st.id;st.status='servicing';st.actualArrival=r.start;s.deliveries[0].status='delivered';s.sensors.find(x=>x.bayId===st.bayId)!.ts=s.now;courierAction(s,c.id,'leave');expect(r.end).toBe(s.now);expect(r.status).toBe('completed');});
  it('T9: przeciążenie w bramie zmienia własny kolejny punkt',()=>{const {s,b,c,rb}=setupConflict();const d=makeDelivery('other','courier4','business2');s.deliveries.push(d);const other:Stop={...b,id:'other-stop',sequence:1,bayId:'bay4',bayGroupId:'group2',deliveryIds:[d.id],eligibleBayIds:['bay4','bay5','bay6'],plannedArrival:rb.start+30*MINUTE};s.stops.push(other);s.reservations.push({...rb,id:'other-res',stopId:other.id,bayId:'bay4',deliveryIds:[d.id],start:other.plannedArrival,end:other.plannedArrival+10*MINUTE});s.candidateSince[rb.id]=s.now-3*MINUTE;repair(s,{id:'p',reservationId:rb.id,type:'overstay',expectedMinutes:20});expect(c.targetStopId).toBe(other.id);});
  it('T10: w drodze lokal pozostaje zamrożony, można zmienić bliźniaka',()=>{const {s,b,rb,c}=setupConflict(true);const ids=[...b.deliveryIds];const old=b.bayId;s.candidateSince[rb.id]=s.now-3*MINUTE;repair(s,{id:'p',reservationId:rb.id,type:'overstay',expectedMinutes:20});expect(b.bayId).not.toBe(old);expect(b.deliveryIds).toEqual(ids);expect(b.frozen).toBe(true);expect(c.targetStopId).toBe(b.id);});
  it('T11: za długi pojazd i SCT po okresie przejściowym są blokowane',()=>{const s=seed();expect(vehicleReason(s,s.vehicles[8])).toContain('duży');expect(vehicleSct(s.vehicles[7],s.models[0],'2026-10-07')).toBe('paid');s.planningDate='2029-01-01';expect(vehicleReason(s,s.vehicles[7])).toBe('Zakaz SCT');expect(vehicleSct({...s.vehicles[7],emissionStandard:5},s.models[4],'2029-01-01')).toBe('allowed');});
  it('T12: trzy lokale z jednego miejsca tworzą jeden łączny postój',()=>{const s=seed();const ds=[makeDelivery('a','courier1','business1'),makeDelivery('b','courier1','business4'),makeDelivery('c','courier1','business7')];s.deliveries=ds;plan(s,s.planningDate);expect(s.stops).toHaveLength(1);expect(s.stops[0].deliveryIds).toHaveLength(3);expect(s.stops[0].plannedServiceMin).toBeGreaterThan(20);expect(s.reservations).toHaveLength(1);});
  it('T13: QR do rezerwacji minus bufor, przekroczenie tworzy incydent',()=>{const s=fixture();s.now=s.reservations[0].start-10*MINUTE;expect(allowedUntil(s,s.reservations[0].bayId)).toBe(s.reservations[0].start-5*MINUTE);s.external.push({id:'e',bayId:'bay1',registrationNumber:'KR 123',start:s.now,allowedUntil:s.now+MINUTE,status:'active'});tick(s,2);expect(s.incidents.some(i=>i.type==='Przekroczony postój QR')).toBe(true);});
  it('T14: histereza i limit zmian nie pozwalają na oscylacje',()=>{const s=fixture();const r=s.reservations[0];const p={id:'p',reservationId:r.id,type:'late',expectedMinutes:6};expect(repair(s,p)).toBe(false);for(let i=0;i<20;i++){s.now+=MINUTE;repair(s,p);}expect(s.changes.filter(c=>!c.forced)).toHaveLength(CONFIG.MAX_CHANGES_PER_HOUR);});
  it('T15: biznes nie zgłasza ani nie zmienia dyspozycji (API)',async()=>{const db=openDb(':memory:');const repo=new Repo(db,seed);const server=createApp(repo).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address() as {port:number};try{const r=await fetch(`http://127.0.0.1:${address.port}/api/business/business1`,{method:'PATCH',headers:{'Content-Type':'application/json','x-role':'business'},body:JSON.stringify({workingHours:[]})});expect(r.status).toBe(403);expect(repo.read().businesses[0].workingHours).toHaveLength(1);}finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}});
  it('T16: przewidywany rozładunek naprawiany przed kolejnym przyjazdem',()=>{const {s,b,rb}=setupConflict(true);const arrival=rb.start;s.now=arrival-5*MINUTE;tick(s,4);expect(s.now).toBeLessThan(arrival);expect(s.changes.length).toBeGreaterThan(0);expect(s.changes[0].appliedAt).toBeLessThan(arrival);});
});

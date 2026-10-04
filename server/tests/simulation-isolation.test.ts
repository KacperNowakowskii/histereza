import { describe, it, expect } from 'vitest';
import { DemoSession } from '../src/sim/demoSession';
import { loadScenarioFiles } from '../src/sim/scenarioFiles';
import { SIMULATION_CONFIG } from '../src/sim/demoConfig';
import { MINUTE } from '@histereza/shared/config';
import { createApp } from '../src/api/app';
import { openDb } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { seed } from '../src/db/seed';
import type { DisruptionKind } from '@histereza/shared/simulation';
const files=loadScenarioFiles(),quiet=files.find(f=>f.id==='quiet')!,morning=files.find(f=>f.id==='morning')!;
describe('Izolowany symulator demonstracyjny',()=>{
  it('wczytuje scenariusze z plików i planuje przez istniejący planner',()=>{
    expect(files.length).toBeGreaterThanOrEqual(2);const sim=new DemoSession(quiet,'scenario','org1','courier1');expect(sim.state.deliveries).toHaveLength(28);expect(sim.state.routes).toHaveLength(7);expect(sim.state.closedDeliveryDates).toContain(quiet.startDate);expect(sim.state.couriers[0].loaded).toBe(true);expect(()=>new DemoSession(quiet,'random','org2','courier1')).toThrow('firmy');
  },30000);
  it('start/stop/reset i kopia odpowiedzi są niezależne od innych sesji',()=>{
    const a=new DemoSession(quiet,'scenario','org1','courier1'),b=new DemoSession(quiet,'scenario','org1','courier1');const initial=b.view().state;a.running=true;a.advance(20);expect(a.state.now).toBe(initial.now+20*MINUTE);expect(b.state).toEqual(initial);a.running=false;const stopped=a.view();a.advance(10);expect(a.view()).toEqual(stopped);const response=a.view();response.state.deliveries=[];expect(a.state.deliveries).toHaveLength(28);a.reset();expect(a.state).toEqual(initial);expect(a.records).toEqual([]);expect(a.running).toBe(false);
  },30000);
  it('kurier porusza się, obsługuje punkty i kończy trasę przez akcje domenowe',()=>{
    const sim=new DemoSession(quiet,'scenario','org1','courier1');const initial=structuredClone(sim.state.couriers[0].location),owners=sim.state.deliveries.map(d=>d.courierId);sim.running=true;sim.advance(120);expect(sim.state.couriers[0].location).not.toEqual(initial);for(let i=0;i<4&&sim.state.couriers[0].status!=='finished';i++)sim.advance(120);expect(sim.state.couriers[0].status).toBe('finished');expect(sim.records.some(r=>r.kind==='completed')).toBe(true);expect(sim.state.deliveries.map(d=>d.courierId)).toEqual(owners);
  },30000);
  it('zaprogramowane zdarzenia mają czas, punkt, reakcję predykcji i naprawy',()=>{
    const sim=new DemoSession(morning,'scenario','org1','courier1');sim.running=true;const start=sim.state.now;sim.advance(120);const traffic=sim.records.find(r=>r.kind==='traffic')!;expect(traffic.ts).toBe(start+3*MINUTE);expect(traffic.minutes).toBe(8);expect(traffic.stopId).toBeTruthy();expect(sim.records.some(r=>r.kind==='conflict'&&r.reaction?.includes('Propozycja'))).toBe(true);expect(sim.records.some(r=>r.kind==='repair'&&r.reaction?.includes('Wpływ'))).toBe(true);expect(sim.state.events.some(e=>e.type==='simulation:traffic')).toBe(true);
  },30000);
  it('losowania są powtarzalne, rzadkie i przestrzegają cooldownu per kurier',()=>{
    const a=new DemoSession(quiet,'random','org1','courier1',321),b=new DemoSession(quiet,'random','org1','courier1',321);a.running=true;b.running=true;a.advance(120);b.advance(120);expect(a.state).toEqual(b.state);expect(a.records).toEqual(b.records);
    const kinds=Object.keys(SIMULATION_CONFIG.probabilities) as DisruptionKind[];const disturbances=a.records.filter(r=>kinds.includes(r.kind as DisruptionKind));expect(disturbances.length).toBeLessThan(a.state.couriers.length*3);for(const c of a.state.couriers){const own=disturbances.filter(r=>r.courierId===c.id);for(let i=1;i<own.length;i++)expect(own[i].ts-own[i-1].ts).toBeGreaterThanOrEqual(SIMULATION_CONFIG.cooldownMinutes*MINUTE);}expect(Object.values(SIMULATION_CONFIG.probabilities).every(p=>p>0&&p<.01)).toBe(true);
  },60000);
  it('pełna symulacja oraz reset i wielokrotne sesje nie zmieniają ŻADNEGO rekordu głównej bazy',async()=>{
    const db=openDb(':memory:'),repo=new Repo(db,seed);const before=repo.read();
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[];
    const snapshot=()=>tables.map(({name})=>({name,rows:db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()}));const original=snapshot();
    const server=createApp(repo).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    const call=async(path:string,body?:unknown,method=body===undefined?'GET':'POST',role='sim')=>{const r=await fetch(base+'/api'+path,{method,headers:{'content-type':'application/json','x-role':role},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
    try {
      for(const mode of ['scenario','random']) {
        const created=await call('/sim/sessions',{mode,scenarioId:mode==='scenario'?'morning':'quiet',orgId:'org1',courierId:'courier1',seed:9});expect(created.status).toBe(201);const path='/sim/sessions/'+created.body.id;
        await call(path+'/start',{});for(let i=0;i<6;i++)expect((await call(path+'/tick',{minutes:120})).status).toBe(200);await call(path+'/stop',{});expect((await call(path+'/reset',{})).body.state.now).toBe(created.body.state.now);await call(path,undefined,'DELETE');
      }
      for(const path of ['reset','demo','day','tick','gps','scenario'])expect((await call('/sim/'+path,{minutes:1})).status).toBe(404);
      expect((await call('/operator/tick',{minutes:1})).status).toBe(403);expect((await call('/sim/catalog',undefined,'GET','courier')).status).toBe(403);
      expect(repo.read()).toEqual(before);expect(snapshot()).toEqual(original);
    } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();}
  },60000);
});

import { it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { unlinkSync,existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seed,sampleCsv } from '../src/db/seed';
import { Repo } from '../src/db/repo';
import { openDb } from '../src/db/db';
import { createApp } from '../src/api/app';
import { validateImport } from '../src/domain/importValidation';
import { available,findSlot } from '../src/domain/calendar';
import { plan } from '../src/services/planningService';
import { at } from '../src/sim/clock';
import { MINUTE } from '@histereza/shared/config';
it('trwałość danych SQLite po zamknięciu i ponownym otwarciu',()=>{
  const path=fileURLToPath(new URL(`../data/test-${randomUUID()}.sqlite`,import.meta.url));let db=openDb(path);
  try{const repo=new Repo(db,seed);repo.mutate(s=>{s.now+=12345;s.notifications.push({id:'saved',userId:'operator',text:'Trwała',ts:s.now});});const expected=repo.read().now;db.close();db=openDb(path);const reopened=new Repo(db,seed);expect(reopened.read().now).toBe(expected);expect(reopened.read().notifications[0].text).toBe('Trwała');}
  finally{db.close();for(const suffix of ['','-wal','-shm'])if(existsSync(path+suffix))unlinkSync(path+suffix);}
});
it('walidacja wiersz po wierszu odrzuca błędy bez częściowego importu',async()=>{
  const db=openDb(':memory:');const repo=new Repo(db,seed);const server=createApp(repo).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as {port:number}).port;
  try{const response=await fetch(`http://127.0.0.1:${port}/api/deliveries/import`,{method:'POST',headers:{'Content-Type':'application/json','x-role':'dispatcher'},body:JSON.stringify({orgId:'org1',csv:sampleCsv(seed(),true),commit:true})});const result=await response.json() as {errors:unknown[]};expect(result.errors.length).toBeGreaterThan(1);expect(repo.read().deliveries).toHaveLength(0);
    const denied=await fetch(`http://127.0.0.1:${port}/api/deliveries/import`,{method:'POST',headers:{'Content-Type':'application/json','x-role':'business'},body:'{}'});expect(denied.status).toBe(403);
  }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
});
it('bufor po wcześniejszym zakończeniu jest egzekwowany również w bazie',()=>{
  const s=seed();const r={id:'done',bayId:'bay1',stopId:'st',vehicleId:'vehicle1',deliveryIds:['d'],start:s.now,end:s.now+2*MINUTE,status:'completed' as const,version:1};s.reservations.push(r);
  expect(available(s,'bay1',r.end+4*MINUTE,r.end+10*MINUTE)).toBe(false);expect(available(s,'bay1',r.end+5*MINUTE,r.end+10*MINUTE)).toBe(true);
  const db=openDb(':memory:');const repo=new Repo(db,()=>s);expect(()=>repo.mutate(x=>{x.reservations.push({...r,id:'new',status:'confirmed',start:r.end+4*MINUTE,end:r.end+10*MINUTE});})).toThrow('Konflikt');expect(repo.read().reservations).toHaveLength(1);db.close();
});
it('brak nowych slotów przy awarii wszystkich czujników i offline',()=>{
  const s=seed();const csv=sampleCsv(s).split('\r\n').filter((_,i)=>i===0||i===1).join('\r\n');s.deliveries=validateImport(s,csv,'org1').deliveries;plan(s,s.planningDate);const stop=s.stops[0];s.sensors.forEach(x=>x.healthy=false);expect(findSlot(s,stop,at(s.planningDate,'08:00'),1,s.reservations[0].id)).toBeUndefined();s.online=false;expect(findSlot(s,stop,at(s.planningDate,'08:00'))).toBeUndefined();
});
it('zegар poprawnie obsługuje czas zimowy Warszawy',()=>{expect(new Date(at('2029-01-02','08:00')).toISOString()).toBe('2029-01-02T07:00:00.000Z');});

import { describe,it,expect } from 'vitest';
import { demoSeed, DEMO_DAY } from '../src/db/demoSeed';
import { Repo } from '../src/db/repo';
import { openDb } from '../src/db/db';
import { declarationsClosed } from '@histereza/shared/deliveryDates';
import { priorityIssues } from '@histereza/shared/priorities';
import { legal } from '../src/domain/calendar';
import { demoSamples } from '../src/db/demoSamples';
import { importCsv } from '../src/services/planningService';
describe('Rozbudowane dane demo',()=>{
  it('tworzy spójne katalogi, siedem dni, historię i stany bieżące bez osłabiania walidacji',()=>{
    const db=openDb(':memory:');try {const repo=new Repo(db,demoSeed),s=repo.read();expect([s.organizations.length,s.couriers.length,s.vehicles.length,s.businesses.length,s.bays.length,s.deliveries.length,s.history.length]).toEqual([5,18,24,45,14,198,500]);expect(new Set(s.deliveries.map(d=>d.date)).size).toBe(7);expect(priorityIssues(s.deliveries)).toEqual([]);expect(db.pragma('foreign_key_check')).toEqual([]);
      for(const d of s.deliveries){expect(s.businesses.find(b=>b.id===d.businessId)?.orgId).toBe(d.carrierOrgId);expect(s.vehicles.find(v=>v.id===d.vehicleId)?.orgId).toBe(d.carrierOrgId);expect(s.couriers.find(c=>c.id===d.courierId)?.orgId).toBe(d.carrierOrgId);if(d.date>DEMO_DAY){expect(d.status).toBe('imported');expect(declarationsClosed(s.now,d.date,s.closedDeliveryDates)).toBe(false);}}
      expect(s.routes.every(r=>r.date<=DEMO_DAY)).toBe(true);expect(s.stops.filter(st=>s.routes.find(r=>r.id===st.routeId)!.date<DEMO_DAY).every(st=>st.status==='done')).toBe(true);expect(s.couriers.some(c=>c.status==='idle')).toBe(true);expect(s.couriers.some(c=>c.status==='driving')).toBe(true);expect(s.couriers.filter(c=>c.status==='servicing').length).toBeGreaterThanOrEqual(2);expect(s.external.some(e=>e.id==='demo-qr')).toBe(true);
      for(const st of s.stops){const r=s.reservations.find(r=>r.stopId===st.id)!;expect(legal(s,r.bayId,r.start,r.end,st)).toBe(true);expect(st.deliveryIds.every(id=>s.deliveries.find(d=>d.id===id)?.courierId===s.routes.find(rt=>rt.id===st.routeId)?.courierId)).toBe(true);}
    }finally{db.close();}
  },30000);
  it('przykłady CSV poprawnie przechodzą walidację, a błędny plik nie zapisuje danych',()=>{
    const s=demoSeed(),samples=demoSamples(s);
    for(const name of ['deliveries.csv','deliveries-next-day.csv','dynamic-deliveries.csv']){const result=importCsv(s,samples[name as keyof typeof samples],'org1',false);expect(result.errors).toEqual([]);expect(result.deliveries.length).toBe(name==='dynamic-deliveries.csv'?2:28);}
    const before=structuredClone(s);const errors=importCsv(s,samples['errors.csv'],'org1',true);expect(errors.errors.length).toBeGreaterThanOrEqual(6);expect(s).toEqual(before);
    const none=s.deliveries.filter(d=>d.priority===0).length/s.deliveries.length;expect(none).toBeGreaterThanOrEqual(.45);expect(none).toBeLessThanOrEqual(.55);
    expect(new Set(s.deliveries.map(d=>d.courierId)).size).toBe(18);
  },30000);
});

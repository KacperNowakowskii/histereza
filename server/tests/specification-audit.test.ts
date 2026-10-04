import { describe,it,expect } from 'vitest';
import { seed } from '../src/db/seed';
import { saveDelivery } from '../src/services/deliveryService';
import { closeDueDeliveryDays } from '../src/services/deliveryCutoff';
import { courierAction } from '../src/services/dayService';
import { tick } from '../src/sim/simulator';
import { at } from '../src/sim/clock';
import { scenario } from '../src/sim/scenarios';
const input=(id:string,courierId:string,businessId:string,vehicleId:string)=>({externalRef:id,courierId,businessId,vehicleId,date:'2026-10-07',cargoType:'standard' as const,priority:0});
function fixture(){const s=seed();saveDelivery(s,'org1',input('a','courier1','business1','vehicle1'));saveDelivery(s,'org1',input('b','courier2','business3','vehicle2'));s.now=at('2026-10-07','00:00');closeDueDeliveryDays(s);return s;}
describe('Końcowe reguły specyfikacji',()=>{
  it('kurier potwierdza przypisany pojazd, ale nie edytuje zamkniętej dostawy',()=>{
    const s=fixture(),before=structuredClone(s);expect(()=>courierAction(s,'courier1','vehicle','vehicle2')).toThrow('po zamknięciu');expect(s).toEqual(before);courierAction(s,'courier1','vehicle','vehicle1');expect(s.deliveries).toEqual(before.deliveries);expect(s.routes[0].vehicleId).toBe('vehicle1');
  });
  it('planowanie i naprawy zamknięć zachowują wszystkie przypisania firmy',()=>{
    const s=fixture(),assigned=s.deliveries.map(d=>[d.id,d.courierId,d.vehicleId]);s.now=at('2026-10-07','07:00');scenario(s,'closure','courier1',s.stops[0].bayId);tick(s,5);expect(s.deliveries.map(d=>[d.id,d.courierId,d.vehicleId])).toEqual(assigned);for(const st of s.stops){const route=s.routes.find(r=>r.id===st.routeId)!;expect(st.deliveryIds.every(id=>s.deliveries.find(d=>d.id===id)?.courierId===route.courierId)).toBe(true);}
  });
});

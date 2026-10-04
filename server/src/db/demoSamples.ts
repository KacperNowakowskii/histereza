import Papa from 'papaparse';
import type { State } from '@histereza/shared/types';
import { systemDay, shiftDay } from '@histereza/shared/deliveryDates';
export function demoSamples(s:State){
  const rows=(offset:number)=>Array.from({length:28},(_,i)=>{const c=s.couriers.filter(c=>c.orgId==='org1')[i%5],v=s.vehicles.find(v=>v.id===c.vehicleId)!,b=s.businesses.filter(b=>b.orgId==='org1')[i%9];const within=Math.floor(i/5);return {externalRef:`SAMPLE-${offset}-${i+1}`,businessId:b.id,businessName:b.name,date:shiftDay(systemDay(s.now),offset),cargoType:v.hasCooling&&within%3===2?'cold':within%3===1?'fresh':'standard',priority:c.id==='courier2'?0:[1,2,3,0,0,0][within],courierId:c.id,vehicleId:v.id};});
  const good=rows(1),other=rows(2),errors=structuredClone(good).slice(0,8);
  Object.assign(errors[0],{date:systemDay(s.now)});Object.assign(errors[1],{businessId:'business-missing',businessName:'Nieistniejący punkt'});Object.assign(errors[2],{courierId:'courier-missing'});Object.assign(errors[3],{vehicleId:'vehicle7'});Object.assign(errors[4],{businessName:'Sprzeczna nazwa'});Object.assign(errors[5],{cargoType:'cold',vehicleId:'vehicle2'});Object.assign(errors[6],{priority:8});Object.assign(errors[7],{date:'2026-02-30'});
  const dynamic=[1,2].map(n=>({externalRef:`DYNAMIC-${n}`,businessName:'Piekarnia Nowy Poranek — nowy punkt CSV',date:shiftDay(systemDay(s.now),2),cargoType:n===1?'cold':'standard',priority:1,courierId:'courier3',registrationNumber:'KR NOW123',businessLat:50.0516,businessLng:19.9441,opens:'07:00',closes:'18:00',bayIds:'bay1|bay2',vehicleModelId:s.models[0].id,fuelType:'diesel',emissionStandard:6,productionYear:2023,hasCooling:true,dimensionsVerified:true}));
  return {'deliveries.csv':Papa.unparse(good),'deliveries-next-day.csv':Papa.unparse(other),'errors.csv':Papa.unparse(errors),'dynamic-deliveries.csv':Papa.unparse(dynamic)};
}

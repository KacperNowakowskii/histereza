import Papa from 'papaparse';
import { csvRowSchema } from '@histereza/shared/schemas';
import type { State, Delivery, Window } from '@histereza/shared/types';
import { vehicleReason } from './vehicles';
import { at, day } from '../sim/clock';
import { CONFIG, MINUTE } from '@histereza/shared/config';
export interface ImportResult { errors: {row: number; message: string}[]; deliveries: Delivery[]; hours: {businessId: string; workingHours: Window[]}[] }
export function validateImport(s: State, csv: string, orgId: string): ImportResult {
  const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:'greedy'});
  const result: ImportResult={errors:parsed.errors.map(e=>({row:(e.row??0)+2,message:e.message})),deliveries:[],hours:[]};
  const existing=new Set(s.deliveries.map(d=>`${d.carrierOrgId}:${d.externalRef}`));
  parsed.data.forEach((row,i)=>{
    const p=csvRowSchema.safeParse(row); const fail=(message:string)=>result.errors.push({row:i+2,message});
    if(!p.success) { fail(p.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`).join('; ')); return; }
    const r=p.data; const c=s.couriers.find(c=>c.id===r.courierId && c.orgId===orgId); const v=s.vehicles.find(v=>v.id===r.vehicleId&&v.orgId===orgId); const b=s.businesses.find(b=>b.id===r.businessId);
    if(!c) fail('Kurier nie istnieje lub nie należy do firmy'); if(!v) fail('Pojazd nie istnieje lub nie należy do firmy'); if(!b) fail('Nieznany punkt dostawy');
    const date=at(r.date,'00:00'); const diff=(date-at(day(s.now),'00:00'))/(24*60*MINUTE);
    if(!Number.isFinite(date)||day(date)!==r.date||diff<1||diff>CONFIG.PLANNING_DAYS) fail('Data poza horyzontem 1–4 dni');
    if(s.now>=date-6*60*MINUTE) fail('Minął cut-off D-1 18:00');
    if(existing.has(`${orgId}:${r.externalRef}`)) fail('Powtórzony numer dostawy'); existing.add(`${orgId}:${r.externalRef}`);
    const d:Delivery={id:`${orgId}:${r.externalRef}`,externalRef:r.externalRef,carrierOrgId:orgId,businessId:r.businessId,date:r.date,cargoType:r.cargoType,quantity:r.quantity,priorityFlags:r.cargoType==='standard'?[]:[r.cargoType],courierId:r.courierId,vehicleId:r.vehicleId,mustFollowDeliveryId:r.mustFollow?`${orgId}:${r.mustFollow}`:undefined,status:'imported'};
    if(v) {const reason=vehicleReason({...s,planningDate:r.date},v,[d]);if(reason) fail(reason);}
    d.workingHours=[{from:r.opens,to:r.closes}];result.deliveries.push(d); result.hours.push({businessId:r.businessId,workingHours:d.workingHours});
  });
  const all=[...s.deliveries,...result.deliveries];
  for(const courierId of new Set(result.deliveries.map(d=>d.courierId))) {const ds=all.filter(d=>d.courierId===courierId&&d.date===result.deliveries.find(x=>x.courierId===courierId)!.date);const v=s.vehicles.find(v=>v.id===ds[0].vehicleId);if(v){const why=vehicleReason(s,v,ds);if(why)result.errors.push({row:result.deliveries.findIndex(d=>d.courierId===courierId)+2,message:why});}}
  for(const d of result.deliveries) {
    if(d.mustFollowDeliveryId) { const prior=all.find(x=>x.id===d.mustFollowDeliveryId); if(!prior||prior.courierId!==d.courierId||prior.date!==d.date) result.errors.push({row:result.deliveries.indexOf(d)+2,message:'mustFollow musi wskazywać dostawę tego samego kuriera i dnia'}); }
    const seen=new Set<string>(); let current:Delivery|undefined=d;
    while(current?.mustFollowDeliveryId) { if(seen.has(current.id)) {result.errors.push({row:result.deliveries.indexOf(d)+2,message:'Cykl mustFollow'});break;} seen.add(current.id);current=all.find(x=>x.id===current!.mustFollowDeliveryId); }
    if(all.some(x=>x.courierId===d.courierId&&x.date===d.date&&x.vehicleId!==d.vehicleId)) result.errors.push({row:result.deliveries.indexOf(d)+2,message:'Kurier ma różne pojazdy w jednym dniu'});
  }
  return result;
}

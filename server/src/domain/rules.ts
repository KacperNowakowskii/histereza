import type { Delivery,State } from '@histereza/shared/types';
export const deliveryPriority=(d:Delivery)=>d.cargoType==='cold'?2:d.cargoType==='fresh'?1:0;
export const deliveryWindows=(s:State,d:Delivery)=>d.workingHours??s.businesses.find(b=>b.id===d.businessId)!.workingHours;
export const canSubmitDelivery=(role:string)=>role==='dispatcher';

import type { State, Delivery, Stop, Route } from '@histereza/shared/types';
import { MINUTE } from '@histereza/shared/config';
import { estimate } from './estimator';
import { findSlot } from './calendar';
import { travelMin, distance } from './geo';
import { at } from '../sim/clock';
import { deliveryPriority } from './rules';
import { fairOrder } from './allocation';
export function orderDeliveries(ds: Delivery[], state?:State) {
  const out:Delivery[]=[]; const remaining=[...ds];
  while(remaining.length) {
    const ready=remaining.filter(d=>!d.mustFollowDeliveryId||out.some(p=>p.id===d.mustFollowDeliveryId));
    if(!ready.length) throw new Error('Niewykonalna kolejność załadunku');
    const rank=deliveryPriority;
    const origin=state?(out.length?state.businesses.find(b=>b.id===out[out.length-1].businessId)!.entryPoint:state.couriers.find(c=>c.id===ds[0].courierId)!.location):undefined;
    const near=(d:Delivery)=>state&&origin?distance(origin,state.businesses.find(b=>b.id===d.businessId)!.entryPoint):0;
    ready.sort((a,b)=>rank(b)-rank(a)||((a.workingHours?.[0].to??'23:59').localeCompare(b.workingHours?.[0].to??'23:59'))||near(a)-near(b)||a.id.localeCompare(b.id));
    out.push(ready[0]); remaining.splice(remaining.indexOf(ready[0]),1);
  }
  // Lokalne usprawnienie dwóch sąsiednich punktów bez zmiany priorytetów i mustFollow.
  if(state)for(let i=0;i<out.length-1;i++) {
    const a=out[i],b=out[i+1];if(a.cargoType!==b.cargoType||b.mustFollowDeliveryId===a.id||a.mustFollowDeliveryId===b.id)continue;
    const point=(d:Delivery)=>state.businesses.find(x=>x.id===d.businessId)!.entryPoint;
    const prev=i?point(out[i-1]):state.couriers.find(c=>c.id===ds[0].courierId)!.location;const next=out[i+2];
    const old=distance(prev,point(a))+(next?distance(point(b),point(next)):0);const improved=distance(prev,point(b))+(next?distance(point(a),point(next)):0);
    if(improved+10<old) [out[i],out[i+1]]=[b,a];
  }
  return out;
}
export function buildStops(s: State, route: Route, ds: Delivery[]) {
  const ordered=orderDeliveries(ds,s); const out:Stop[]=[];
  for(const d of ordered) {
    const ids=s.links.filter(l=>l.businessId===d.businessId).map(l=>l.bayId);
    const group=s.bays.find(b=>ids.includes(b.id))?.groupId; if(!group) throw new Error('Brak miejsca dla lokalu');
    const previous=out[out.length-1];
    const common=previous?.eligibleBayIds.filter(id=>ids.includes(id))??[];
    if(previous&&previous.bayGroupId===group&&common.length) { previous.deliveryIds.push(d.id);previous.eligibleBayIds=common; }
    else out.push({id:`${route.id}:stop${out.length+1}`,routeId:route.id,sequence:out.length,bayGroupId:group,bayId:ids[0],deliveryIds:[d.id],plannedArrival:0,plannedServiceMin:0,frozen:false,status:'pending',eligibleBayIds:ids});
  }
  for(const stop of out) stop.plannedServiceMin=stop.deliveryIds.reduce((total,id)=>{ const d=ds.find(d=>d.id===id)!;return total+estimate(s.history,d.businessId,stop.bayId,d.cargoType);},0)+1;
  return out;
}
// Une demande par organisation à chaque tour; aucun poids de paiement ou de taille.
function planDraft(s: State, date: string) {
  if(s.routes.some(r=>r.date===date)) throw new Error('Ce jour possède déjà un plan');
  const ready=new Map<string,number>();
  for(const c of s.couriers) {
    const ds=s.deliveries.filter(d=>d.courierId===c.id&&d.date===date&&d.status==='imported'); if(!ds.length) continue;
    const route:Route={id:`route:${date}:${c.id}`,courierId:c.id,vehicleId:ds[0].vehicleId,date,stopIds:[],breaks:[],loadingList:[]};
    s.routes.push(route);const stops=buildStops(s,route,ds);s.stops.push(...stops);route.stopIds=stops.map(st=>st.id);route.loadingList=stops.flatMap(st=>st.deliveryIds).reverse();
    c.vehicleId=route.vehicleId;ready.set(c.id,at(date,'07:00'));
    for(let i=3;i<stops.length;i+=3) route.breaks.push({afterStopId:stops[i-1].id,minutes:15});
  }
  const queues=s.organizations.map(o=>s.stops.filter(st=>s.routes.some(r=>r.id===st.routeId&&r.date===date&&s.couriers.find(c=>c.id===r.courierId)?.orgId===o.id)));
  for(const stop of fairOrder(queues)) {
    const route=s.routes.find(r=>r.id===stop.routeId)!;const c=s.couriers.find(c=>c.id===route.courierId)!;
    const prev=s.stops.find(st=>st.routeId===route.id&&st.sequence===stop.sequence-1);
    const breakMin=prev?route.breaks.find(b=>b.afterStopId===prev.id)?.minutes??0:0;
    const origin=prev?s.bays.find(b=>b.id===prev.bayId)!:c.location;const bay=s.bays.find(b=>b.id===stop.bayId)!;
    const earliest=(ready.get(c.id)??at(date,'07:00'))+(travelMin(origin,bay)+breakMin)*MINUTE;
    const slot=findSlot(s,stop,earliest);
    if(!slot) {stop.status='waiting';continue;}
    stop.bayId=slot.bayId;stop.plannedArrival=slot.start;ready.set(c.id,slot.end);
    s.reservations.push({id:`res:${stop.id}`,bayId:slot.bayId,stopId:stop.id,deliveryIds:stop.deliveryIds,vehicleId:route.vehicleId,start:slot.start,end:slot.end,status:'confirmed',version:1});
    s.usage.push({orgId:c.orgId,reservationId:`res:${stop.id}`,units:1});
    for(const id of stop.deliveryIds) s.deliveries.find(d=>d.id===id)!.status='planned';
  }
  return s.routes.filter(r=>r.date===date);
}
export function createPlan(s:State,date:string):State {const next=structuredClone(s);planDraft(next,date);return next;}

import assert from 'node:assert/strict';
const base=process.env.BASE_URL??'http://127.0.0.1:3001';
async function call(path,body,role='sim',method=body===undefined?'GET':'POST') {
  const response=await fetch(`${base}/api${path}`,{method,headers:{'Content-Type':'application/json','x-role':role},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.equal(response.ok,true,`${path}: ${JSON.stringify(data)}`);return data;
}
await call('/sim/reset',{});await call('/sim/demo',{});
let s=await call('/reference');assert.equal(s.deliveries.length,45);assert.equal(s.couriers.length,7);assert.equal(s.bays.length,8);assert.ok(s.routes.length===7);assert.equal(s.stops.filter(x=>x.status==='waiting').length,0);
for(const d of s.deliveries) assert.equal(d.courierId,`courier${(Number(d.externalRef.slice(1))-1)%7+1}`);
const courier=s.couriers[0],route=s.routes.find(r=>r.courierId===courier.id);const stop=s.stops.find(st=>st.id===route.stopIds[0]);
await call(`/courier/${courier.id}/action`,{action:'vehicle',vehicleId:route.vehicleId},'courier');
await call(`/courier/${courier.id}/action`,{action:'load'},'courier');await call(`/courier/${courier.id}/action`,{action:'depart'},'courier');await call(`/courier/${courier.id}/action`,{action:'drive'},'courier');
let delta=Math.round((stop.plannedArrival-s.now)/60000);if(delta>0)await call('/sim/tick',{minutes:delta});
s=await call('/reference');let target=s.stops.find(x=>x.id===s.couriers[0].targetStopId);
if(target.plannedArrival>s.now)await call('/sim/tick',{minutes:Math.ceil((target.plannedArrival-s.now)/60000)});
await call('/sim/gps',{courierId:courier.id,bayId:target.bayId,occupied:true});await call(`/courier/${courier.id}/action`,{action:'arrive'},'courier');await call('/sim/tick',{minutes:2});await call(`/courier/${courier.id}/action`,{action:'deliver'},'courier');await call('/sim/gps',{courierId:courier.id,bayId:target.bayId,occupied:false});await call(`/courier/${courier.id}/action`,{action:'leave'},'courier');
s=await call('/reference');assert.equal(s.stops.find(x=>x.id===target.id).status,'done');assert.ok(s.history.length>300);
await call('/sim/scenario',{id:'delay',courierId:'courier2',bayId:'bay1'});await call('/sim/tick',{minutes:4});await call('/sim/scenario',{id:'closure',courierId:'courier3',bayId:'bay4'});
await call('/sim/scenario',{id:'offline',bayId:'bay1'});s=await call('/reference');assert.equal(s.online,false);await call('/sim/scenario',{id:'restore',bayId:'bay1'});
const denied=await fetch(`${base}/api/business/business1`,{method:'PATCH',headers:{'Content-Type':'application/json','x-role':'business'},body:'{}'});assert.equal(denied.status,403);
const report=await call('/reports',undefined,'operator');assert.equal(report.rows.length,2);
assert.equal((await fetch(`${base}/api/public/bay1/qr`)).status,200);
assert.equal((await fetch(`${base}/courier`)).status,200);
s=await call('/reference');for(const a of s.reservations.filter(r=>r.status==='confirmed'))for(const b of s.reservations.filter(r=>r.status==='confirmed'&&r.id!==a.id&&r.bayId===a.bayId))assert.ok(a.end+300000<=b.start||b.end+300000<=a.start,'Nakładające się sloty');
console.log('SMOKE OK: 45 dostaw, 7 tras, cykl kuriera, naprawy, offline, role, raporty, QR, brak kolizji.');
// Zostawiamy gotowe, czyste demo do przeglądu użytkownika.
await call('/sim/reset',{});await call('/sim/demo',{});

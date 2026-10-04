import assert from 'node:assert/strict';
const base=process.env.BASE_URL??'http://127.0.0.1:3001';
async function call(path,body,method=body===undefined?'GET':'POST'){const r=await fetch(base+'/api'+path,{method,headers:{'content-type':'application/json','x-role':'sim'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
const before=await call('/reference');const catalog=await call('/sim/catalog');assert.ok(catalog.scenarios.length);
const created=await call('/sim/sessions',{mode:'scenario',scenarioId:'morning',orgId:'org1',courierId:'courier1'});const path='/sim/sessions/'+created.id;
try{await call(path+'/start',{});await call(path+'/tick',{minutes:120});await call(path+'/stop',{});const reset=await call(path+'/reset',{});assert.equal(reset.state.now,created.state.now);assert.deepEqual(await call('/reference'),before);console.log('SMOKE OK: isolated simulation, start/tick/stop/reset; main application unchanged.');}finally{await call(path,undefined,'DELETE');}

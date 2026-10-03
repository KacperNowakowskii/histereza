import express from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Repo } from '../db/repo';
import { seed, sampleCsv } from '../db/seed';
import { actionSchema, registrationSchema } from '@histereza/shared/schemas';
import { MINUTE } from '@histereza/shared/config';
import { importCsv } from '../services/planningService';
import { courierAction, event, incident } from '../services/dayService';
import { plan } from '../services/planningService';
import { tick } from '../sim/simulator';
import { scenarios, scenario } from '../sim/scenarios';
import { at } from '../sim/clock';
import { allowedUntil, bayScreen } from '../domain/externalParking';
import { legal } from '../domain/calendar';
import { fairness } from '../domain/fairness';
import { vehicleReason, vehicleSct } from '../domain/vehicles';
export function createApp(repo:Repo) {
  const app=express();app.use(express.json({limit:'2mb'}));
  const allow=(roles:string[]) => (req:express.Request,res:express.Response,next:express.NextFunction)=>{if(!roles.includes(req.header('x-role')??'')){res.status(403).json({error:'Ta rola nie ma uprawnień do tej czynności'});return;}next();};
  app.get('/api/health',(_req,res)=>res.json({ok:true,storage:'SQLite',now:repo.read().now}));
  app.get('/api/reference',(_req,res)=>{const s=repo.read();res.json({...s,bayScreens:Object.fromEntries(s.bays.map(b=>[b.id,bayScreen(s,b.id)])),vehicleOptions:s.vehicles.map(v=>({...v,reason:vehicleReason(s,v),sctStatus:vehicleSct(v,s.models.find(m=>m.id===v.vehicleModelId)!,s.planningDate)})),scenarios});});
  app.get('/api/samples/:kind', (req,res)=>{const s=repo.read();const org=z.enum(['org1','org2','org3','org4']).parse(req.query.orgId??'org1');const all=sampleCsv(s,req.params.kind==='errors').split('\r\n');const rows=all.filter((line,i)=>i===0||line.split(',')[5]?.match(org==='org1'?/^courier[123]$/:org==='org2'?/^courier[45]$/:org==='org3'?/^courier6$/:/^courier7$/)||req.params.kind==='errors'&&i===1);res.type('text/csv').attachment(`${req.params.kind}.csv`).send(rows.join('\r\n'));});
  app.post('/api/deliveries/import',allow(['dispatcher','independent']), (req,res)=>{const body=z.object({csv:z.string().max(1_000_000),orgId:z.enum(['org1','org2','org3','org4']),commit:z.boolean().default(false)}).parse(req.body);res.json(repo.mutate(s=>importCsv(s,body.csv,body.orgId,body.commit)));});
  app.post('/api/planning/cutoff',allow(['dispatcher','sim']),(_req,res)=>res.json(repo.mutate(s=>{if(!s.online)throw new Error('Brak sieci');s.now=Math.max(s.now,at(s.planningDate,'00:00')-6*60*MINUTE);const routes=plan(s,s.planningDate);s.cutoffApplied=true;event(s,'cutoff','system',{});return routes;})));
  app.post('/api/courier/:id/action',allow(['courier','independent']), (req,res)=>{const b=actionSchema.parse(req.body);res.json(repo.mutate(s=>courierAction(s,String(req.params.id),b.action,b.vehicleId,b.reason)));});
  app.post('/api/business/:id/deliveries',(_req,res)=>res.status(403).json({error:'Odbiorca nie zgłasza dostaw ani dyspozycji'}));
  app.patch('/api/business/:id',(_req,res)=>res.status(403).json({error:'Godziny pracy i dyspozycje wprowadza firma kurierska'}));
  app.patch('/api/deliveries/:id',(_req,res)=>res.status(403).json({error:'Przypisanie kuriera jest niezmienne; plan zmienia wyłącznie system'}));
  app.post('/api/sim/tick',allow(['sim','operator']), (req,res)=>{const b=z.object({minutes:z.number().int().min(1).max(120)}).parse(req.body);res.json(repo.mutate(s=>{tick(s,b.minutes);return {now:s.now};}));});
  app.post('/api/sim/day',allow(['sim']),(_req,res)=>res.json(repo.mutate(s=>{if(!s.routes.length)throw new Error('Najpierw import i cut-off');s.now=at(s.planningDate,'07:00');s.sensors.forEach(x=>x.ts=s.now);event(s,'start-day','sim',{});return {now:s.now};})));
  app.post('/api/sim/reset',allow(['sim']),(_req,res)=>{repo.save(seed());res.json({ok:true});});
  app.post('/api/sim/demo',allow(['sim']),(_req,res)=>res.json(repo.mutate(s=>{
    if(s.deliveries.length)throw new Error('Demo wymaga pustych danych — użyj resetu');
    const csv=sampleCsv(s).split('\r\n');
    for(const org of s.organizations){const ids=s.couriers.filter(c=>c.orgId===org.id).map(c=>c.id);const text=csv.filter((line,i)=>i===0||ids.includes(line.split(',')[5])).join('\r\n');const result=importCsv(s,text,org.id,true);if(result.errors.length)throw new Error(JSON.stringify(result.errors));}
    plan(s,s.planningDate);s.cutoffApplied=true;s.now=at(s.planningDate,'07:00');s.sensors.forEach(x=>x.ts=s.now);event(s,'demo','sim',{});return {ok:true};
  })));
  app.post('/api/sim/scenario',allow(['sim','operator']), (req,res)=>{const b=z.object({id:z.string(),courierId:z.string().default('courier1'),bayId:z.string().default('bay1')}).parse(req.body);res.json(repo.mutate(s=>{scenario(s,b.id,b.courierId,b.bayId);tick(s,1);return {ok:true};}));});
  app.post('/api/sim/gps',allow(['sim']), (req,res)=>{const b=z.object({courierId:z.string(),bayId:z.string(),occupied:z.boolean()}).parse(req.body);res.json(repo.mutate(s=>{const c=s.couriers.find(c=>c.id===b.courierId);const bay=s.bays.find(x=>x.id===b.bayId);if(!c||!bay)throw new Error('Nieznany kurier lub miejsce');c.location={lat:bay.lat,lng:bay.lng};const sensor=s.sensors.find(x=>x.bayId===bay.id)!;sensor.occupied=b.occupied;sensor.ts=s.now;event(s,'gps-sensor','sim',b);return {ok:true};}));});
  app.post('/api/operator/resolve',allow(['operator']), (req,res)=>{const b=z.object({id:z.string(),resolution:z.enum(['cleared','sensor-repaired','verified'])}).parse(req.body);res.json(repo.mutate(s=>{const i=s.incidents.find(i=>i.id===b.id);if(!i)throw new Error('Nieznany incydent');i.status='resolved';i.resolution=b.resolution;event(s,'incident-resolved','operator',b);return i;}));});
  app.get('/api/reports',allow(['operator','dispatcher']),(_req,res)=>res.json(fairness(repo.read())));
  app.get('/api/public/:id/qr',async(req,res,next)=>{try{const id=String(req.params.id);if(!repo.read().bays.some(b=>b.id===id))throw new Error('Nieznane miejsce');res.type('image/svg+xml').send(await QRCode.toString(`http://localhost:3001/qr/${encodeURIComponent(id)}`,{type:'svg'}));}catch(e){next(e);}});
  app.post('/api/public/:id/park',allow(['public']), (req,res)=>{const plate=registrationSchema.parse(req.body.registrationNumber);res.json(repo.mutate(s=>{
    if(!s.online)throw new Error('Brak sieci — nie przydzielamy nowych postojów');const bayId=String(req.params.id);const sensor=s.sensors.find(x=>x.bayId===bayId);if(!sensor||!sensor.healthy||sensor.occupied||s.now-sensor.ts>2*MINUTE)throw new Error('Miejsce zajęte lub brak wiarygodnego odczytu');
    const until=allowedUntil(s,bayId);if(until<=s.now||!legal(s,bayId,s.now,until))throw new Error('Brak dostępnego legalnego czasu');
    const e={id:randomUUID(),bayId,registrationNumber:plate,start:s.now,allowedUntil:until,status:'active' as const};s.external.push(e);sensor.occupied=true;sensor.ts=s.now;
    s.reservations.push({id:`res:${e.id}`,bayId,externalParkingId:e.id,deliveryIds:[],start:s.now,end:until,status:'confirmed',version:1});event(s,'external-parking','public',e);return e;
  }));});
  app.post('/api/public/:id/leave',allow(['public']), (req,res)=>{const b=z.object({externalParkingId:z.string()}).parse(req.body);res.json(repo.mutate(s=>{const e=s.external.find(e=>e.id===b.externalParkingId&&e.bayId===req.params.id);if(!e)throw new Error('Nieznany postój');e.status='ended';const sensor=s.sensors.find(x=>x.bayId===e.bayId)!;sensor.occupied=false;sensor.ts=s.now;const r=s.reservations.find(r=>r.externalParkingId===e.id)!;r.status='completed';r.end=Math.max(r.start+MINUTE,s.now);r.version++;event(s,'external-left','public',{id:e.id});return {ok:true};}));});
  app.use('/api',(_req,res)=>res.status(404).json({error:'Nieznany endpoint API'}));
  const dist=fileURLToPath(new URL('../../../client/dist/',import.meta.url));if(existsSync(dist)){app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(`${dist}/index.html`));}
  app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(error instanceof z.ZodError?422:409).json({error:error instanceof Error?error.message:'Błąd operacji'});});
  return app;
}

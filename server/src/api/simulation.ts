import { Router } from 'express';
import { z } from 'zod';
import { demoCatalog } from '../db/demoSeed';
import { DemoSession } from '../sim/demoSession';
import { loadScenarioFiles } from '../sim/scenarioFiles';
import { SIMULATION_CONFIG } from '../sim/demoConfig';
// Celowo bez argumentu Repo: ten router nie ma dostępu do głównej bazy.
export function simulationApi() {
  const router=Router(), sessions=new Map<string,DemoSession>(), files=loadScenarioFiles();
  router.use((req,res,next)=>{if(req.header('x-role')!=='sim'){res.status(403).json({error:'Panel demonstracyjnego symulatora wymaga roli Symulator'});return;}next();});
  router.get('/catalog',(_req,res)=>{const s=demoCatalog();res.json({scenarios:files.map(({id,name})=>({id,name})),organizations:s.organizations,couriers:s.couriers});});
  router.post('/sessions',(req,res)=>{
    const b=z.object({mode:z.enum(['scenario','random']),scenarioId:z.string(),orgId:z.string(),courierId:z.string(),seed:z.number().int().min(0).max(4294967295).default(1)}).strict().parse(req.body);
    const file=files.find(f=>f.id===b.scenarioId);if(!file)throw new Error('Nieznany plik scenariusza');
    if(sessions.size>=SIMULATION_CONFIG.maxSessions)throw new Error('Zamknij poprzednią sesję przed utworzeniem kolejnej');
    const session=new DemoSession(file,b.mode,b.orgId,b.courierId,b.seed);sessions.set(session.id,session);res.status(201).json(session.view());
  });
  router.param('id',(req,res,next,id)=>{if(!sessions.has(id)){res.status(404).json({error:'Nieznana sesja demonstracyjna'});return;}next();});
  router.get('/sessions/:id',(req,res)=>res.json(sessions.get(String(req.params.id))!.view()));
  router.delete('/sessions/:id',(req,res)=>{sessions.delete(String(req.params.id));res.json({ok:true});});
  for(const command of ['start','stop','reset','tick'] as const)router.post(`/sessions/:id/${command}`,(req,res)=>{
    const session=sessions.get(String(req.params.id))!;
    if(command==='tick'){const b=z.object({minutes:z.number().int().min(1).max(120)}).parse(req.body);res.json(session.advance(b.minutes));return;}
    if(command==='reset')session.reset();else session.running=command==='start';res.json(session.view());
  });
  return router;
}

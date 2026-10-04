import { Router } from 'express';
import { z } from 'zod';
import type { Repo } from '../db/repo';
import { listBusinesses, lookupBusiness, saveBusiness, deleteBusiness, listFleet, saveVehicle, deleteVehicle } from '../services/catalogService';
export function catalogApi(repo: Repo) {
  const router = Router();
  router.use((req, res, next) => { if (req.header('x-role') !== 'dispatcher') { res.status(403).json({ error: 'Katalogi może zmieniać wyłącznie firma kurierska' }); return; } next(); });
  router.get('/:orgId/businesses/lookup', (req, res) => {
    const query = z.object({ id: z.string().trim().min(1).optional(), name: z.string().trim().min(1).optional() }).refine(q => q.id || q.name, 'Podaj ID lub nazwę').parse(req.query);
    res.json(lookupBusiness(repo.read(), String(req.params.orgId), query));
  });
  router.get('/:orgId/businesses', (req, res) => res.json(listBusinesses(repo.read(), String(req.params.orgId))));
  router.post('/:orgId/businesses', (req, res) => res.status(201).json(repo.mutate(s => saveBusiness(s, String(req.params.orgId), req.body))));
  router.put('/:orgId/businesses/:id', (req, res) => res.json(repo.mutate(s => saveBusiness(s, String(req.params.orgId), req.body, String(req.params.id)))));
  router.delete('/:orgId/businesses/:id', (req, res) => res.json(repo.mutate(s => deleteBusiness(s, String(req.params.orgId), String(req.params.id)))));
  router.get('/:orgId/fleet', (req, res) => res.json(listFleet(repo.read(), String(req.params.orgId))));
  router.post('/:orgId/fleet', (req, res) => res.status(201).json(repo.mutate(s => saveVehicle(s, String(req.params.orgId), req.body))));
  router.put('/:orgId/fleet/:id', (req, res) => res.json(repo.mutate(s => saveVehicle(s, String(req.params.orgId), req.body, String(req.params.id)))));
  router.delete('/:orgId/fleet/:id', (req, res) => res.json(repo.mutate(s => deleteVehicle(s, String(req.params.orgId), String(req.params.id)))));
  return router;
}

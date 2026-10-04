import { describe, expect, it } from 'vitest';
import { seed, sampleCsv } from '../src/db/seed';
import { openDb } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { createApp } from '../src/api/app';
import { migrateBusinessOwnership } from '../src/db/migrations';
import { importCsv, plan } from '../src/services/planningService';
import { saveBusiness, deleteBusiness, listBusinesses, lookupBusiness, saveVehicle, deleteVehicle } from '../src/services/catalogService';

const business = () => ({ id: 'catalog-business', name: 'Sklep Łąka', entryPoint: { lat: 50.054, lng: 19.944 }, workingHours: [{ from: '08:00', to: '17:00' }], unloadingConditions: 'Od zaplecza', unattendedDropAllowed: false, bayIds: ['bay1'] });
const vehicle = () => ({ id: 'catalog-vehicle', registrationNumber: 'KR TEST1', fuelType: 'diesel', emissionStandard: 6, productionYear: 2022, hasCooling: true, dimensionsVerified: true, model: { name: 'Furgon', lengthM: 5, widthM: 2, heightM: 2.5, maxLoadKg: 1000, gvwKg: 3500 } });

describe('Katalogi firmy', () => {
  it('zapisuje i usuwa biznes wraz z powiązaniem z miejscem oraz wyszukuje po ID i nazwie', () => {
    const db = openDb(':memory:');
    try {
      const repo = new Repo(db, seed);
      const created = repo.mutate(s => saveBusiness(s, 'org1', business()));
      expect(created.orgId).toBe('org1'); expect(created.links[0].walkingM).toBeGreaterThanOrEqual(0);
      expect(lookupBusiness(repo.read(), 'org1', { id: created.id }).business?.name).toBe(created.name);
      expect(lookupBusiness(repo.read(), 'org1', { name: '  SKLEP ŁĄKA  ' }).business?.id).toBe(created.id);
      expect(lookupBusiness(repo.read(), 'org2', { id: created.id }).business).toBeNull();
      repo.mutate(s => saveBusiness(s, 'org1', { ...business(), name: 'Nowa nazwa' }, created.id));
      expect(db.prepare('SELECT name FROM businesses WHERE id=?').get(created.id)).toEqual({ name: 'Nowa nazwa' });
      repo.mutate(s => deleteBusiness(s, 'org1', created.id));
      expect(repo.read().links.some(l => l.businessId === created.id)).toBe(false);
      expect(db.prepare('SELECT id FROM businesses WHERE id=?').get(created.id)).toBeUndefined();
    } finally { db.close(); }
  });
  it('nie wybiera automatycznie biznesu przy dwóch identycznych nazwach', () => {
    const s = seed(); saveBusiness(s, 'org1', business()); saveBusiness(s, 'org1', { ...business(), id: 'another' });
    const result = lookupBusiness(s, 'org1', { name: business().name });
    expect(result.matches).toHaveLength(2); expect(result.business).toBeNull();
  });
  it('chroni własność, unikalne ID, niezmienne ID i istniejące miejsca', () => {
    const s = seed(); saveBusiness(s, 'org1', business());
    expect(() => saveBusiness(s, 'org2', business(), business().id)).toThrow('tej firmy');
    expect(() => deleteBusiness(s, 'org2', business().id)).toThrow('tej firmy');
    expect(() => saveBusiness(s, 'org2', business())).toThrow('już istnieje');
    expect(() => saveBusiness(s, 'org1', { ...business(), id: 'changed' }, business().id)).toThrow('niezmienne');
    expect(() => saveBusiness(s, 'org1', { ...business(), id: 'bad-bay', bayIds: ['missing'] })).toThrow('miejsce');
    expect(listBusinesses(s, 'org2').every(b => b.orgId === 'org2')).toBe(true);
  });
  it('aktualizuje nazwę w powiązanych dostawach i blokuje usunięcie używanego biznesu', () => {
    const s = seed(); const b = s.businesses[0]; const v = s.vehicles[0]; const c = s.couriers[0];
    s.deliveries.push({ id: 'test', externalRef: 'test', carrierOrgId: c.orgId, businessId: b.id, businessName: b.name, date: s.planningDate, cargoType: 'standard', vehicleId: v.id, courierId: c.id, priority: 0, status: 'imported' });
    const db = openDb(':memory:');
    try {
      const repo = new Repo(db, () => s);
      const { orgId, hoursSourceOrgId, ...fields } = b;
      repo.mutate(state => saveBusiness(state, orgId, { ...fields, name: 'Nowa nazwa', bayIds: state.links.filter(l => l.businessId === b.id).map(l => l.bayId) }, b.id));
      expect(repo.read().deliveries[0].businessName).toBe('Nowa nazwa');
      expect(() => repo.mutate(state => deleteBusiness(state, b.orgId, b.id))).toThrow('dostawami');
      expect(() => repo.mutate(state => deleteVehicle(state, v.orgId, v.id))).toThrow('powiązanego');
    } finally { db.close(); }
  });
  it('CRUD floty zachowuje dane techniczne i nie zmienia współdzielonego modelu', () => {
    const s = seed(); const original = structuredClone(s.models);
    const first = saveVehicle(s, 'org1', vehicle());
    saveVehicle(s, 'org1', { ...vehicle(), id: 'second', registrationNumber: 'KR TEST2' });
    const edited = saveVehicle(s, 'org1', { ...vehicle(), model: { ...vehicle().model, heightM: 2.8 } }, first.id);
    expect(edited.model.heightM).toBe(2.8);
    const second = s.vehicles.find(v => v.id === 'second')!;
    expect(s.models.find(m => m.id === second.vehicleModelId)?.heightM).toBe(2.5);
    expect(s.models.slice(0, original.length)).toEqual(original);
    expect(() => saveVehicle(s, 'org2', vehicle(), first.id)).toThrow('tej firmy');
    expect(() => deleteVehicle(s, 'org2', first.id)).toThrow('tej firmy');
    expect(() => saveVehicle(s, 'org1', { ...vehicle(), id: 'third', registrationNumber: 'krtest1' })).toThrow('rejestracyjny');
    expect(() => saveVehicle(s, 'org1', { ...vehicle(), id: 'invalid', registrationNumber: 'KR BAD', model: { ...vehicle().model, maxLoadKg: 5000 } })).toThrow();
    deleteVehicle(s, 'org1', first.id); expect(s.vehicles.some(v => v.id === first.id)).toBe(false);
  });
  it('migracja właścicieli nie zmienia dostaw ani tras i jest idempotentna', () => {
    const s = seed(); const old = structuredClone(s);
    old.businesses.forEach(b => { delete (b as Partial<typeof b>).orgId; });
    const migrated = migrateBusinessOwnership(old);
    expect(migrated.businesses.every(b => b.orgId === b.hoursSourceOrgId)).toBe(true);
    expect(migrated.deliveries).toEqual(s.deliveries); expect(migrated.routes).toEqual(s.routes);
    expect(migrateBusinessOwnership(migrated)).toEqual(migrated);
  });
  it('chroni aktywny plan przed zmianą godzin, lokalizacji i parametrów pojazdu', () => {
    const s = seed(); const csv = sampleCsv(s).split('\r\n').slice(0, 2).join('\r\n');
    expect(importCsv(s, csv, 'org1', true).errors).toEqual([]); plan(s, s.planningDate);
    const b = s.businesses.find(b => b.id === s.deliveries[0].businessId)!;
    const { orgId, hoursSourceOrgId, ...fields } = b;
    const input = { ...fields, bayIds: s.links.filter(l => l.businessId === b.id).map(l => l.bayId) };
    const links = structuredClone(s.links); const routes = structuredClone(s.routes); const stops = structuredClone(s.stops);
    expect(() => saveBusiness(s, orgId, { ...input, workingHours: [{ from: '12:00', to: '13:00' }] }, b.id)).toThrow('aktywnym planie');
    expect(() => saveBusiness(s, orgId, { ...input, entryPoint: { lat: 50, lng: 20 } }, b.id)).toThrow('aktywnym planie');
    saveBusiness(s, orgId, { ...input, name: 'Nowa nazwa' }, b.id);
    expect(s.links).toEqual(links); expect(s.routes).toEqual(routes); expect(s.stops).toEqual(stops);
    const v = s.vehicles.find(v => v.id === s.routes[0].vehicleId)!;
    const m = s.models.find(m => m.id === v.vehicleModelId)!;
    const { vehicleModelId, orgId: vehicleOrg, ...vehicleFields } = v;
    const { id: modelId, ...model } = m;
    expect(() => saveVehicle(s, vehicleOrg, { ...vehicleFields, model: { ...model, name: m.name ?? m.id, heightM: 2.9 } }, v.id)).toThrow('aktywnym planie');
  });
  it('HTTP egzekwuje rolę, walidację, CRUD i zakres firmy', async () => {
    const db = openDb(':memory:'); const repo = new Repo(db, seed);
    const server = createApp(repo).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/companies`;
    const call = (path: string, method = 'GET', body?: unknown, role = 'dispatcher') => fetch(url + path, { method, headers: { 'x-role': role, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    try {
      expect((await call('/org1/businesses', 'GET', undefined, 'courier')).status).toBe(403);
      expect((await call('/org1/businesses', 'POST', { ...business(), workingHours: [{ from: '99:00', to: '17:00' }] })).status).toBe(422);
      expect((await call('/org1/businesses', 'POST', business())).status).toBe(201);
      const found = await (await call(`/org1/businesses/lookup?name=${encodeURIComponent(business().name)}`)).json();
      expect(found.business.id).toBe(business().id);
      expect((await call(`/org2/businesses/${business().id}`, 'DELETE')).status).toBe(409);
      expect((await call(`/org1/businesses/${business().id}`, 'DELETE')).status).toBe(200);
      expect((await call('/org1/fleet', 'POST', vehicle())).status).toBe(201);
      expect((await call(`/org1/fleet/${vehicle().id}`, 'PUT', { ...vehicle(), registrationNumber: 'KR NEW' })).status).toBe(200);
      expect((await call(`/org1/fleet/${vehicle().id}`, 'DELETE')).status).toBe(200);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
  });
});

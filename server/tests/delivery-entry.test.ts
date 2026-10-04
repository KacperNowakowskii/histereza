import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { seed, sampleCsv } from '../src/db/seed';
import { saveDelivery, deleteDelivery } from '../src/services/deliveryService';
import { importCsv, plan } from '../src/services/planningService';
import { validateImport } from '../src/domain/importValidation';
import { openDb } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { createApp } from '../src/api/app';
import type { DeliveryInput } from '@histereza/shared/deliveryInput';

const input = (externalRef = 'ENTRY1'): DeliveryInput => ({ externalRef, date: '2026-10-07', cargoType: 'standard', priority: 1, courierId: 'courier1', businessId: 'business1', vehicleId: 'vehicle1' });
const newBusiness = () => ({ name: 'Sklep Łąka, zaplecze', entryPoint: { lat: 50.054, lng: 19.944 }, workingHours: [{ from: '08:00', to: '17:00' }], unloadingConditions: '', unattendedDropAllowed: false, bayIds: ['bay1'] });
const newVehicle = () => ({ registrationNumber: 'KR NOW1', fuelType: 'diesel' as const, emissionStandard: 6, productionYear: 2020, hasCooling: true, dimensionsVerified: true, model: { name: 'model1', lengthM: 4.4, widthM: 1.8, heightM: 2, maxLoadKg: 1500, gvwKg: 3500 } });
const newRow = () => ({ externalRef: 'NEW', date: '2026-10-07', cargoType: 'standard', priority: '1', courierId: 'courier1', businessName: newBusiness().name, businessLat: '50.054', businessLng: '19.944', opens: '08:00', closes: '17:00', bayIds: 'bay1', registrationNumber: 'KR NOW1', vehicleModelId: 'model1', fuelType: 'diesel', emissionStandard: '6', productionYear: '2020', hasCooling: 'true', dimensionsVerified: 'true' });
const csv = (rows: object[]) => Papa.unparse(rows);

describe('Wspólne tworzenie dostaw CSV i ręczne', () => {
  it.each([
    { businessId: 'business1', vehicleId: 'vehicle1' },
    { businessName: '  LOKAL DEMONSTRACYJNY 1 ', registrationNumber: 'krdem1' },
  ])('uzupełnia biznes i pojazd z katalogów: %j', identifiers => {
    const s = seed(); const { businessId, vehicleId, ...fields } = input();
    const d = saveDelivery(s, 'org1', { ...fields, ...identifiers });
    expect(d.businessId).toBe('business1'); expect(d.businessName).toBe('Lokal demonstracyjny 1'); expect(d.vehicleId).toBe('vehicle1');
    expect(d.workingHours).toEqual(s.businesses[0].workingHours); expect(d).not.toHaveProperty('quantity');
  });
  it('zapisuje dokładnie ten sam rekord przez CSV i formularz ręczny', () => {
    const a = seed(), b = seed();
    const manual = saveDelivery(a, 'org1', input());
    const imported = importCsv(b, csv([{ ...input(), priority: '1' }]), 'org1', true);
    expect(imported.errors).toEqual([]); expect(imported.deliveries).toEqual([manual]); expect(b.deliveries).toEqual(a.deliveries);
  });
  it('obie ścieżki tworzą biznes i pojazd oraz identyczne ID bez podanych identyfikatorów', () => {
    const a = seed(), b = seed(); const { businessId, vehicleId, ...fields } = input('NEW');
    const manual = saveDelivery(a, 'org1', { ...fields, newBusiness: newBusiness(), newVehicle: newVehicle() });
    const imported = importCsv(b, csv([newRow()]), 'org1', true);
    expect(imported.errors).toEqual([]); expect(imported.deliveries).toEqual([manual]);
    expect(imported.newBusinessIds).toEqual([manual.businessId]); expect(imported.newVehicleIds).toEqual([manual.vehicleId]);
    expect(b.businesses).toEqual(a.businesses); expect(b.vehicles).toEqual(a.vehicles); expect(b.models).toEqual(a.models); expect(b.links).toEqual(a.links);
  });
  it('podgląd i błędny commit nie zostawiają dostaw ani nowych rekordów katalogu', () => {
    const db = openDb(':memory:');
    try {
      const repo = new Repo(db, seed); const before = repo.read();
      expect(repo.mutate(s => importCsv(s, csv([newRow()]), 'org1', false)).errors).toEqual([]);
      expect(repo.read()).toEqual(before);
      const result = repo.mutate(s => importCsv(s, csv([newRow(), { ...newRow(), externalRef: 'BAD', courierId: 'missing' }]), 'org1', true));
      expect(result.errors.some(e => e.row === 3)).toBe(true); expect(repo.read()).toEqual(before);
      const { businessId, vehicleId, ...fields } = input();
      expect(() => repo.mutate(s => saveDelivery(s, 'org1', { ...fields, cargoType: 'cold', newBusiness: newBusiness(), newVehicle: { ...newVehicle(), hasCooling: false } }))).toThrow('chłodnia');
      expect(repo.read()).toEqual(before);
    } finally { db.close(); }
  });
  it('kolejne wiersze mogą użyć biznesu i pojazdu utworzonych w tym samym pliku', () => {
    const s = seed(); const result = importCsv(s, csv([newRow(), { ...newRow(), externalRef: 'NEXT' }]), 'org1', true);
    expect(result.errors).toEqual([]); expect(result.deliveries).toHaveLength(2); expect(result.newBusinessIds).toHaveLength(1); expect(result.newVehicleIds).toHaveLength(1);
    expect(result.deliveries[0].businessId).toBe(result.deliveries[1].businessId); expect(result.deliveries[0].vehicleId).toBe(result.deliveries[1].vehicleId);
  });
  it('niejednoznaczne nazwy, sprzeczne identyfikatory i obca firma dają błąd wiersza', () => {
    const s = seed(); s.businesses[2].name = s.businesses[0].name;
    for (const fields of [
      { businessId: undefined, businessName: s.businesses[0].name },
      { businessId: 'business1', businessName: 'Niepoprawna nazwa' },
      { businessId: 'unknown', businessName: s.businesses[0].name },
      { businessId: 'business2' },
      { registrationNumber: 'KR DEM2' },
      { vehicleId: 'vehicle4' },
    ]) {
      const result = validateImport(s, csv([{ ...input(), priority: '1', ...fields }]), 'org1');
      expect(result.errors.length).toBeGreaterThan(0); expect(result.errors[0].row).toBe(2);
    }
  });
  it('waliduje niepełny nowy biznes, niepełny nowy pojazd i nieobsługiwane quantity', () => {
    for (const fields of [{ businessLat: '' }, { registrationNumber: '' }, { fuelType: '' }, { dimensionsVerified: 'false' }, { quantity: '3' }, { priority: '1.5' }, { date: '2026-02-30' }]) {
      const result = validateImport(seed(), csv([{ ...newRow(), ...fields }]), 'org1');
      expect(result.errors.length).toBeGreaterThan(0); expect(result.errors[0].row).toBe(2);
    }
  });
  it('odrzuca niezgodne parametry istniejącego pojazdu i modelu', () => {
    expect(validateImport(seed(), csv([{ ...input(), priority: '1', lengthM: '30' }]), 'org1').errors[0].message).toContain('sprzeczne');
    expect(validateImport(seed(), csv([{ ...newRow(), lengthM: '30' }]), 'org1').errors[0].message).toContain('sprzeczne');
  });
  it('tworzy nowy model z pełnych danych technicznych', () => {
    const s = seed(); const result = importCsv(s, csv([{ ...newRow(), vehicleModelId: '', vehicleModelName: 'Nowy furgon', lengthM: '4.5', widthM: '1.8', heightM: '2.5', maxLoadKg: '1000', gvwKg: '3500' }]), 'org1', true);
    expect(result.errors).toEqual([]); const v = s.vehicles.find(v => v.id === result.deliveries[0].vehicleId)!;
    expect(s.models.find(m => m.id === v.vehicleModelId)?.name).toBe('Nowy furgon');
  });
  it('edycja zachowuje ID i zmienia biznes, datę, cargo, pojazd, kuriera i priorytet', () => {
    const s = seed(); const d = saveDelivery(s, 'org1', input());
    const edited = saveDelivery(s, 'org1', { ...input(), businessId: 'business3', date: '2026-10-08', cargoType: 'cold', vehicleId: 'vehicle2', courierId: 'courier2', priority: 1 }, d.id);
    expect(edited).toMatchObject({ id: d.id, businessId: 'business3', businessName: 'Lokal demonstracyjny 3', date: '2026-10-08', cargoType: 'cold', vehicleId: 'vehicle2', courierId: 'courier2', priority: 1 });
    expect(s.deliveries).toHaveLength(1); deleteDelivery(s, 'org1', d.id); expect(s.deliveries).toEqual([]);
    expect(s.businesses).toHaveLength(25); expect(s.vehicles).toHaveLength(9);
  });
  it('chroni numer dostawy, rolę firmy, plan i spójność kurier–pojazd w dniu', () => {
    const s = seed(); const d = saveDelivery(s, 'org1', input());
    expect(() => saveDelivery(s, 'org1', { ...input(), externalRef: 'CHANGED' }, d.id)).toThrow('niezmienny');
    expect(() => saveDelivery(s, 'org2', input(), d.id)).toThrow('firmy');
    expect(() => saveDelivery(s, 'org1', { ...input('OTHER'), vehicleId: 'vehicle2' })).toThrow('różne pojazdy');
    expect(() => saveDelivery(s, 'org1', input())).toThrow('Powtórzony');
    plan(s, s.planningDate); const before = structuredClone(s);
    expect(() => saveDelivery(s, 'org1', input(), d.id)).toThrow('planu'); expect(() => deleteDelivery(s, 'org1', d.id)).toThrow('planu'); expect(s).toEqual(before);
  });
  it('przykładowy CSV obejmuje wyłącznie biznesy właściwej firmy i daje 28 dostaw', () => {
    const s = seed(); const rows = Papa.parse<Record<string, string>>(sampleCsv(s), { header: true }).data;
    for (const org of s.organizations) {
      const ids = s.couriers.filter(c => c.orgId === org.id).map(c => c.id);
      const result = importCsv(s, csv(rows.filter(r => ids.includes(r.courierId))), org.id, true);
      expect(result.errors).toEqual([]);
    }
    expect(s.deliveries).toHaveLength(28); expect(s.deliveries.every(d => s.businesses.find(b => b.id === d.businessId)?.orgId === d.carrierOrgId)).toBe(true);
    plan(s, s.planningDate); expect(s.routes).toHaveLength(7);
  });
  it('API pozwala firmie dodać, edytować i usunąć przygotowaną dostawę', async () => {
    const db = openDb(':memory:'); const repo = new Repo(db, seed); const server = createApp(repo).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/deliveries`;
    const call = (path: string, method: string, body?: unknown, role = 'dispatcher') => fetch(url + path, { method, headers: { 'x-role': role, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    try {
      expect((await call('', 'POST', { orgId: 'org1', delivery: input() }, 'courier')).status).toBe(403);
      expect((await call('', 'POST', { orgId: 'org1', delivery: input() })).status).toBe(201);
      const id = encodeURIComponent(repo.read().deliveries[0].id);
      expect((await call(`/${id}`, 'PATCH', { orgId: 'org1', delivery: { ...input(), priority: 1 } })).status).toBe(200);
      expect(repo.read().deliveries[0].priority).toBe(1);
      expect((await call(`/${id}?orgId=org2`, 'DELETE')).status).toBe(409);
      expect((await call(`/${id}?orgId=org1`, 'DELETE')).status).toBe(200); expect(repo.read().deliveries).toEqual([]);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
  });
});

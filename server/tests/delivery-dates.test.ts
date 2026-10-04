import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { declarationDeadlineMessage, deliveryDays, systemDay, shiftDay } from '@histereza/shared/deliveryDates';
import { seed } from '../src/db/seed';
import { at } from '../src/sim/clock';
import { tick } from '../src/sim/simulator';
import { closeDueDeliveryDays } from '../src/services/deliveryCutoff';
import { saveDelivery, deleteDelivery } from '../src/services/deliveryService';
import { importCsv, plan } from '../src/services/planningService';
import { courierAction } from '../src/services/dayService';
import { openDb } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { createApp } from '../src/api/app';
const input = (ref = 'DATE', date = '2026-10-10') => ({ externalRef: ref, date, cargoType: 'standard' as const, priority: 0, businessId: 'business1', vehicleId: 'vehicle1', courierId: 'courier1' });
const state = (date = '2026-10-09', time = '23:59') => { const s = seed(); s.now = at(date, time); closeDueDeliveryDays(s); return s; };

describe('Zamknięcie deklaracji o północy', () => {
  it('23:59 pozwala zadeklarować, edytować i usunąć dostawę na następny dzień', () => {
    const s = state(); const d = saveDelivery(s, 'org1', input());
    expect(saveDelivery(s, 'org1', { ...input(), cargoType: 'fresh' }, d.id).cargoType).toBe('fresh');
    deleteDelivery(s, 'org1', d.id); expect(s.deliveries).toEqual([]); expect(s.routes).toEqual([]); expect(s.closedDeliveryDates).not.toContain('2026-10-10');
  });
  it('00:00 zamyka dzień, tworzy plan i udostępnia trasę kurierowi', () => {
    const s = state(); const d = saveDelivery(s, 'org1', input());
    saveDelivery(s, 'org1', input('NEXT', '2026-10-11')); saveDelivery(s, 'org1', input('LATER', '2026-10-12'));
    expect(s.routes).toEqual([]); tick(s, 1);
    expect(s.now).toBe(at('2026-10-10', '00:00')); expect(s.planningDate).toBe('2026-10-10'); expect(s.closedDeliveryDates).toContain('2026-10-10');
    expect(s.closedDeliveryDates).not.toContain('2026-10-11'); expect(s.routes.map(r => r.date)).toEqual(['2026-10-10']);
    expect(s.deliveries.find(x => x.id === d.id)?.status).toBe('planned'); expect(s.deliveries.filter(x => x.date > '2026-10-10').every(x => x.status === 'imported')).toBe(true);
    courierAction(s, 'courier1', 'vehicle', 'vehicle1'); expect(s.couriers[0].vehicleId).toBe('vehicle1');
    const message = declarationDeadlineMessage('2026-10-10');
    expect(() => saveDelivery(s, 'org1', input('CLOSED'))).toThrow(message);
    expect(() => saveDelivery(s, 'org1', input(), d.id)).toThrow(message); expect(() => deleteDelivery(s, 'org1', d.id)).toThrow(message);
    expect(saveDelivery(s, 'org1', input('OPEN', '2026-10-11')).status).toBe('imported');
  });
  it('CSV jest dozwolone o 23:59, a o 00:00 podaje jednoznaczny błąd wiersza bez częściowego zapisu', () => {
    const s = state(); const csv = Papa.unparse([input('CSV')]); expect(importCsv(s, csv, 'org1', false).errors).toEqual([]);
    tick(s, 1); const before = structuredClone(s);
    const result = importCsv(s, Papa.unparse([input('CLOSED'), input('OPEN', '2026-10-11')]), 'org1', true);
    expect(result.errors).toEqual([{ row: 2, message: declarationDeadlineMessage('2026-10-10') }]); expect(s).toEqual(before);
  });
  it('historia i bieżący dzień są zamknięte nawet bez istniejących tras', () => {
    const s = state('2026-10-10', '08:00');
    for (const date of ['2026-10-08', '2026-10-09', '2026-10-10']) expect(() => saveDelivery(s, 'org1', input(date, date))).toThrow(declarationDeadlineMessage(date));
    expect(s.routes).toEqual([]);
  });
  it('zamknięcie jest idempotentne, działa dla pustego dnia i powtarza się następnego dnia', () => {
    const s = state(); saveDelivery(s, 'org1', input('TOMORROW')); saveDelivery(s, 'org1', input('AFTER', '2026-10-11'));
    tick(s, 1); const firstRoutes = structuredClone(s.routes); const firstCount = s.events.filter(e => e.type === 'delivery-day-closed').length;
    closeDueDeliveryDays(s); tick(s, 1); expect(s.routes).toEqual(firstRoutes); expect(s.events.filter(e => e.type === 'delivery-day-closed')).toHaveLength(firstCount);
    s.now = at('2026-10-11', '00:00'); closeDueDeliveryDays(s);
    expect(s.routes.map(r => r.date)).toEqual(['2026-10-10', '2026-10-11']); expect(s.planningDate).toBe('2026-10-11');
    const empty = state(); tick(empty, 1); closeDueDeliveryDays(empty); expect(empty.closedDeliveryDates.filter(d => d === '2026-10-10')).toHaveLength(1); expect(empty.routes).toEqual([]);
  });
  it('zamyka dzień również przy symulowanym offline, zachowując bezpieczne oczekiwanie na slot', () => {
    const s = state(); saveDelivery(s, 'org1', input()); s.online = false; tick(s, 1);
    expect(s.closedDeliveryDates).toContain('2026-10-10'); expect(s.routes).toHaveLength(1); expect(s.stops.every(st => st.status === 'waiting')).toBe(true);
    expect(s.reservations.every(r => r.status === 'suspended')).toBe(true);
  });
  it.each(['2026-03-28', '2026-10-24'])('liczy trzy dni kalendarzowe mimo zmiany czasu: %s', date => {
    const s = state(date, '23:59');
    for (let offset = 1; offset <= 3; offset++) expect(saveDelivery(s, 'org1', input(String(offset), shiftDay(date, offset))).date).toBe(shiftDay(date, offset));
    expect(() => saveDelivery(s, 'org1', input('FOUR', shiftDay(date, 4)))).toThrow('trzech kolejnych dni');
    tick(s, 1); expect(systemDay(s.now)).toBe(shiftDay(date, 1)); expect(s.closedDeliveryDates).toContain(shiftDay(date, 1));
  });
  it('okno nawigacji zawiera 2 dni przeszłe, bieżący i 3 przyszłe', () => {
    expect(deliveryDays(at('2026-10-09', '23:59')).map(d => d.date)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
    expect(deliveryDays(at('2026-12-31', '23:59')).at(-1)?.date).toBe('2027-01-03');
  });
  it('restart po północy domyka daty i nie powiela planów po kolejnym otwarciu', () => {
    const db = openDb(':memory:');
    try {
      const s = state(); saveDelivery(s, 'org1', input()); s.now = at('2026-10-10', '00:00');
      db.prepare('INSERT INTO state VALUES (1,?)').run(JSON.stringify(s)); db.pragma('user_version = 5');
      const repo = new Repo(db, seed); expect(repo.read().routes).toHaveLength(1); expect(repo.read().closedDeliveryDates).toContain('2026-10-10');
      const before = repo.read(); expect(new Repo(db, seed).read()).toEqual(before);
    } finally { db.close(); }
  });
  it('migracja cofa przedwczesny plan przyszłego dnia do deklaracji i zachowuje bieżącą trasę', () => {
    const db = openDb(':memory:');
    try {
      const s = state('2026-10-09', '07:00'); const current = { ...input('CURRENT', '2026-10-09'), id: 'current', carrierOrgId: 'org1', businessName: 'Lokal demonstracyjny 1', status: 'imported' as const };
      s.deliveries.push(current); plan(s, '2026-10-09'); const currentRoute = structuredClone(s.routes[0]);
      saveDelivery(s, 'org1', input()); plan(s, '2026-10-10');
      db.prepare('INSERT INTO state VALUES (1,?)').run(JSON.stringify({ ...s, cutoffApplied: true })); db.pragma('user_version = 4');
      const repo = new Repo(db, seed); const migrated = repo.read(); expect(migrated.routes).toEqual([currentRoute]);
      expect(migrated.deliveries.find(d => d.date === '2026-10-10')?.status).toBe('imported'); expect(migrated.closedDeliveryDates).not.toContain('2026-10-10'); expect(migrated).not.toHaveProperty('cutoffApplied');
      expect(migrated.stops.every(st => st.routeId === currentRoute.id)).toBe(true); expect(migrated.reservations.every(r => migrated.stops.some(st => st.id === r.stopId))).toBe(true);
    } finally { db.close(); }
  });
  it('tick nowego dnia nie modyfikuje postojów i rezerwacji historycznych', () => {
    const s = state(); saveDelivery(s, 'org1', input()); tick(s, 1);
    const oldStops = structuredClone(s.stops), oldReservations = structuredClone(s.reservations);
    s.now = at('2026-10-11', '08:00'); closeDueDeliveryDays(s); tick(s, 1);
    expect(s.stops).toEqual(oldStops); expect(s.reservations).toEqual(oldReservations);
  });
  it('HTTP automatycznie zamyka dzień po tick i usuwa ręczny endpoint cut-off', async () => {
    const db = openDb(':memory:'); const repo = new Repo(db, () => state()); const server = createApp(repo).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const call = (path: string, method: string, body?: unknown, role = 'dispatcher') => fetch(base + path, { method, headers: { 'x-role': role, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    try {
      expect((await call('/planning/cutoff', 'POST', {}, 'dispatcher')).status).toBe(404);
      expect((await call('/deliveries', 'POST', { orgId: 'org1', delivery: input() })).status).toBe(201);
      expect(repo.read().routes).toEqual([]);
      expect((await call('/operator/tick', 'POST', { minutes: 1 }, 'operator')).status).toBe(200); expect(repo.read().routes).toHaveLength(1);
      const id = encodeURIComponent(repo.read().deliveries[0].id), before = repo.read();
      for (const [path, method, body] of [
        ['/deliveries', 'POST', { orgId: 'org1', delivery: input('CLOSED') }],
        [`/deliveries/${id}`, 'PATCH', { orgId: 'org1', delivery: input() }],
        [`/deliveries/${id}?orgId=org1`, 'DELETE', undefined],
      ] as const) {
        const response = await call(path, method, body); expect(response.status).toBe(409); expect((await response.json()).error).toBe(declarationDeadlineMessage('2026-10-10'));
      }
      const response = await call('/deliveries/import', 'POST', { orgId: 'org1', commit: true, csv: Papa.unparse([input('CLOSED-CSV')]) });
      expect((await response.json()).errors[0].message).toBe(declarationDeadlineMessage('2026-10-10')); expect(repo.read()).toEqual(before);
      const sample = await call('/samples/deliveries?orgId=org1&date=2026-10-12', 'GET');
      expect(Papa.parse<Record<string,string>>(await sample.text(), { header: true }).data.every(row => row.date === '2026-10-12')).toBe(true);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
  });
});

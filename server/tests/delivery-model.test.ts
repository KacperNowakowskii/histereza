import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Delivery } from '@histereza/shared/types';
import { deliverySchema, deliverySchemaFor, roleSchema } from '@histereza/shared/schemas';
import { seed } from '../src/db/seed';
import { openDb } from '../src/db/db';
import { Repo } from '../src/db/repo';
import { createApp } from '../src/api/app';
import { createPlan } from '../src/domain/planner';

function delivery(id = 'delivery1'): Delivery {
  return {
    id, externalRef: id, carrierOrgId: 'org1', businessId: 'business1',
    businessName: 'Lokal demonstracyjny 1', date: '2026-10-07', cargoType: 'standard',
    vehicleId: 'vehicle1', courierId: 'courier1', priority: 1, status: 'imported',
  };
}

describe('Nowy model dostawy', () => {
  it('wymaga biznesu, nazwy, daty, cargo, pojazdu, kuriera i priorytetu', () => {
    const valid = delivery();
    expect(deliverySchemaFor(seed()).parse(valid)).toEqual(valid);
    for (const key of ['businessId', 'businessName', 'date', 'cargoType', 'vehicleId', 'courierId']) {
      const missing: Record<string, unknown> = { ...valid }; delete missing[key];
      expect(deliverySchema.safeParse(missing).success, key).toBe(false);
    }
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2'])('odrzuca nieprawidłowy priorytet %s', priority => {
    expect(deliverySchema.safeParse({ ...delivery(), priority }).success).toBe(false);
  });
  it('odrzuca nieistniejące ID biznesu, pojazdu i kuriera oraz błędną nazwę', () => {
    const schema = deliverySchemaFor(seed());
    for (const field of ['businessId', 'vehicleId', 'courierId', 'businessName']) {
      const result = schema.safeParse({ ...delivery(), [field]: 'missing' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues.some(i => i.path[0] === field)).toBe(true);
    }
  });
  it('nie akceptuje usuniętych pól ani niepoprawnej daty', () => {
    for (const field of ['quantity', 'mustFollow', 'mustFollowDeliveryId', 'priorityFlags']) {
      expect(deliverySchema.safeParse({ ...delivery(), [field]: 1 }).success).toBe(false);
    }
    expect(deliverySchema.safeParse({ ...delivery(), date: '2026-02-30' }).success).toBe(false);
  });
  it('zapisuje dwie dostawy z tym samym priorytetem i bez dawnych pól', () => {
    const s = seed(); s.deliveries = [delivery('a'), delivery('b')];
    const db = openDb(':memory:');
    try {
      const repo = new Repo(db, () => s);
      expect(repo.read().deliveries.map(d => d.priority)).toEqual([1, 1]);
      expect(db.prepare('SELECT priority FROM deliveries').all()).toEqual([{ priority: 1 }, { priority: 1 }]);
      expect(db.prepare('PRAGMA table_info(deliveries)').all().map(row => (row as { name: string }).name)).not.toContain('quantity');
    } finally { db.close(); }
  });
  it('SQLite egzekwuje FK biznesu, floty i kuriera także przy bezpośrednim zapisie', () => {
    const db = openDb(':memory:');
    try {
      new Repo(db, seed);
      const statement = db.prepare('INSERT INTO deliveries VALUES (@id,@businessId,@businessName,@date,@cargoType,@vehicleId,@courierId,@priority,@payload)');
      for (const field of ['businessId', 'vehicleId', 'courierId']) {
        expect(() => statement.run({ ...delivery(), [field]: 'missing', payload: '{}' })).toThrow('FOREIGN KEY');
      }
      expect(() => statement.run({ ...delivery(), priority: -1, payload: '{}' })).toThrow('CHECK');
    } finally { db.close(); }
  });
  it('nie pozwala usunąć biznesu lub pojazdu wykorzystywanego przez dostawę', () => {
    const s = seed(); s.deliveries = [delivery()]; const db = openDb(':memory:');
    try {
      const repo = new Repo(db, () => s);
      expect(() => db.prepare("DELETE FROM businesses WHERE id='business1'").run()).toThrow('FOREIGN KEY');
      expect(() => db.prepare("DELETE FROM vehicles WHERE id='vehicle1'").run()).toThrow('FOREIGN KEY');
      expect(() => repo.mutate(state => { state.businesses = state.businesses.filter(b => b.id !== 'business1'); })).toThrow('Nieznany biznes');
      expect(repo.read().businesses.some(b => b.id === 'business1')).toBe(true);
    } finally { db.close(); }
  });
  it('brak priorytetu normalizuje do zera, a jedna grupa nie ogranicza planowania', () => {
    const s = seed(); s.deliveries = [delivery('a'), { ...delivery('b'), businessId: 'business2', businessName: 'Lokal demonstracyjny 2' }];
    const original = createPlan(s, s.planningDate);
    s.deliveries.forEach(d => d.priority = 0);
    const changed = createPlan(s, s.planningDate);
    expect(changed.stops).toEqual(original.stops);
    expect(changed.routes[0].loadingMode).toBe('free');
    const { priority, ...without } = delivery(); expect(deliverySchema.parse(without).priority).toBe(0);
  });
  it('seed zawiera wyłącznie firmy i kurierów firmowych', () => {
    const s = seed();
    expect(s.organizations).toHaveLength(2);
    expect(s.organizations.every(o => o.type === 'carrier')).toBe(true);
    expect(s.couriers).toHaveLength(7);
    expect(s.users.every(u => u.role === 'courier')).toBe(true);
    expect(s.couriers.every(c => s.organizations.some(o => o.id === c.orgId))).toBe(true);
    expect(roleSchema.safeParse('independent').success).toBe(false);
  });
  it('stara rola nie ma dostępu do API importu ani kuriera', async () => {
    const db = openDb(':memory:'); const server = createApp(new Repo(db, seed)).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
      const port = (server.address() as { port: number }).port;
      for (const path of ['/api/deliveries/import', '/api/courier/courier1/action']) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'x-role': 'independent', 'Content-Type': 'application/json' }, body: '{}' });
        expect(response.status).toBe(403);
      }
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
  });
});

it('migruje starą bazę z kopią, zachowuje firmowe przypisania i jest idempotentna', () => {
  const path = fileURLToPath(new URL(`../data/migration-test-${randomUUID()}.sqlite`, import.meta.url));
  const backup = `${path}.pre-model-v5.sqlite`; const db = openDb(path);
  try {
    const s = seed();
    const old = structuredClone(s) as unknown as Record<string, any>;
    const { businessName, priority, ...base } = delivery();
    old.deliveries = [{ ...base, quantity: 4, mustFollowDeliveryId: 'old', priorityFlags: ['fresh'] }];
    old.organizations.push({ id: 'old-org', name: 'Dawny uczestnik', type: 'independent', size: 'small' });
    old.users.push({ id: 'old-user', orgId: 'old-org', role: 'independent' });
    old.couriers.push({ ...s.couriers[0], id: 'old-courier', userId: 'old-user', orgId: 'old-org' });
    old.vehicles.push({ ...s.vehicles[0], id: 'old-vehicle', orgId: 'old-org' });
    old.deliveries.push({ ...old.deliveries[0], id: 'old-delivery', carrierOrgId: 'old-org', courierId: 'old-courier', vehicleId: 'old-vehicle' });
    old.routes.push({ id: 'old-route', courierId: 'old-courier', vehicleId: 'old-vehicle', date: s.planningDate, stopIds: ['old-stop'], breaks: [], loadingList: ['old-delivery'] });
    old.stops.push({ id: 'old-stop', routeId: 'old-route' });
    old.reservations.push({ id: 'old-reservation', stopId: 'old-stop' });
    old.history[0].quantity = 1;
    db.prepare('INSERT INTO state VALUES (1,?)').run(JSON.stringify(old));
    const repo = new Repo(db, seed); const migrated = repo.read();
    expect(existsSync(backup)).toBe(true);
    expect(migrated.deliveries).toEqual([{ ...base, businessName: 'Lokal demonstracyjny 1', priority: 0 }]);
    expect(migrated.organizations).toHaveLength(2);
    expect(migrated.users.every(u => u.role === 'courier')).toBe(true);
    expect(migrated.routes).toEqual([]); expect(migrated.stops).toEqual([]); expect(migrated.reservations).toEqual([]);
    expect(migrated.history[0]).not.toHaveProperty('quantity');
    expect(new Repo(db, seed).read()).toEqual(migrated);
    const copy = openDb(backup);
    try { const saved = JSON.parse((copy.prepare('SELECT payload FROM state').get() as { payload: string }).payload); expect(saved.deliveries[0].quantity).toBe(4); }
    finally { copy.close(); }
  } finally {
    db.close();
    for (const file of [path, backup]) for (const suffix of ['', '-wal', '-shm']) if (existsSync(file + suffix)) unlinkSync(file + suffix);
  }
});

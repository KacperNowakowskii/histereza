import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import type { Delivery } from '@histereza/shared/types';
import { assertPriorities, priorityChoices, loadingGroups } from '@histereza/shared/priorities';
import { seed } from '../src/db/seed';
import { saveDelivery, deleteDelivery } from '../src/services/deliveryService';
import { importCsv, plan } from '../src/services/planningService';
import { orderDeliveries } from '../src/domain/planner';
import { canDrive, decideGate } from '../src/domain/gate';
import { repairPlan } from '../src/domain/repair';
import { at } from '../src/sim/clock';
import { tick } from '../src/sim/simulator';
import { MINUTE } from '@histereza/shared/config';
import { openDb } from '../src/db/db';
import { Repo } from '../src/db/repo';
const delivery = (id: string, priority: number, businessId = 'business1'): Delivery => ({ id, externalRef: id, carrierOrgId: 'org1', courierId: 'courier1', vehicleId: 'vehicle1', date: '2026-10-07', cargoType: 'standard', priority, businessId, businessName: `Lokal demonstracyjny ${businessId.slice(8)}`, status: 'imported' });
const input = (ref: string, priority?: number) => ({ externalRef: ref, date: '2026-10-07', cargoType: 'standard', courierId: 'courier1', vehicleId: 'vehicle1', businessId: 'business1', ...(priority === undefined ? {} : { priority }) });

describe('Grupy priorytetowe bez luk', () => {
  it.each([[0, 0], [1], [1, 1, 2, 2, 3], [0, 1, 2, 0]])('akceptuje grupy %j', (...levels) => {
    expect(() => assertPriorities(levels.map((p, i) => delivery(String(i), p)))).not.toThrow();
  });
  it.each([[2], [0, 2], [1, 3], [1, 2, 4], [1000000]])('blokuje luki %j', (...levels) => {
    expect(() => assertPriorities(levels.map((p, i) => delivery(String(i), p)))).toThrow('Brakuje priorytetu');
  });
  it('ciąg jest oddzielny dla kuriera, pojazdu, daty i firmy', () => {
    for (const changes of [{ courierId: 'courier2' }, { vehicleId: 'vehicle2' }, { date: '2026-10-08' }, { carrierOrgId: 'org2' }]) {
      expect(() => assertPriorities([delivery('one', 1), { ...delivery('two', 2), ...changes }])).toThrow('Brakuje priorytetu 1');
    }
  });
  it('ręczny zapis, edycja i usuwanie nie mogą utworzyć luki i są atomowe', () => {
    const s = seed(); const original = structuredClone(s);
    expect(() => saveDelivery(s, 'org1', input('invalid', 2))).toThrow('Brakuje priorytetu 1'); expect(s).toEqual(original);
    const a = saveDelivery(s, 'org1', input('a', 1)); const b = saveDelivery(s, 'org1', input('b', 2));
    const before = structuredClone(s);
    expect(() => deleteDelivery(s, 'org1', a.id)).toThrow('Brakuje priorytetu 1'); expect(s).toEqual(before);
    expect(() => saveDelivery(s, 'org1', input('a', 0), a.id)).toThrow('Brakuje priorytetu 1'); expect(s).toEqual(before);
    expect(() => saveDelivery(s, 'org1', { ...input('a', 1), date: '2026-10-08' }, a.id)).toThrow('Brakuje priorytetu 1'); expect(s).toEqual(before);
    saveDelivery(s, 'org1', input('another-one', 1)); deleteDelivery(s, 'org1', a.id);
    deleteDelivery(s, 'org1', b.id); expect(s.deliveries.map(d => d.priority)).toEqual([1]);
    expect(saveDelivery(s, 'org1', input('no-priority')).priority).toBe(0);
  });
  it('CSV ocenia cały plik, niezależnie od kolejności grup w wierszach', () => {
    const s = seed(); const csv = Papa.unparse([input('two', 2), input('one', 1), input('empty')]);
    const result = importCsv(s, csv, 'org1', true); expect(result.errors).toEqual([]); expect(s.deliveries.map(d => d.priority)).toEqual([2, 1, 0]);
    const missing = seed(); const before = structuredClone(missing);
    const bad = importCsv(missing, Papa.unparse([input('one', 1), input('three', 3)]), 'org1', true);
    expect(bad.errors).toEqual([expect.objectContaining({ row: 3, message: expect.stringContaining('Brakuje priorytetu 2') })]); expect(missing).toEqual(before);
    expect(importCsv(seed(), 'externalRef,date,cargoType,courierId,vehicleId,businessId\r\nnone,2026-10-07,standard,courier1,vehicle1,business1', 'org1', true).errors).toEqual([]);
  });
  it('UI udostępnia istniejące grupy i następną oraz blokuje usunięcie niższej grupy przez edycję', () => {
    expect(priorityChoices([], delivery('draft', 0)).filter(o => !o.disabled).map(o => o.value)).toEqual([0, 1]);
    expect(priorityChoices([delivery('one', 1)], delivery('draft', 0)).filter(o => !o.disabled).map(o => o.value)).toEqual([0, 1, 2]);
    const choices = priorityChoices([delivery('two', 2)], delivery('one', 1));
    expect(choices.find(o => o.value === 0)?.disabled).toBe(true); expect(choices.find(o => o.value === 2)?.disabled).toBe(true); expect(choices.find(o => o.value === 1)?.disabled).toBe(false);
  });
  it('SQLite repo odrzuca niepoprawną grupę bez częściowego zapisu', () => {
    const db = openDb(':memory:');
    try { const repo = new Repo(db, seed); const before = repo.read(); expect(() => repo.mutate(s => s.deliveries.push(delivery('gap', 2)))).toThrow('Brakuje priorytetu 1'); expect(repo.read()).toEqual(before); }
    finally { db.close(); }
  });
});

describe('Realizacja i załadunek grup', () => {
  it('numer grupy jest ważniejszy niż cargo, okno godzinowe i odległość', () => {
    const s = seed(); s.businesses[0].entryPoint = { lat: 50.5, lng: 20.5 };
    const ds = [delivery('none', 0, 'business3'), { ...delivery('two-cold', 2, 'business2'), cargoType: 'cold' as const, workingHours: [{ from: '07:00', to: '08:00' }] }, { ...delivery('one', 1), workingHours: [{ from: '07:00', to: '23:00' }] }, { ...delivery('two-fresh', 2, 'business4'), cargoType: 'fresh' as const }];
    const ordered = orderDeliveries(ds, s);
    expect(ordered.map(d => d.priority)).toEqual([1, 2, 2, 0]); expect(ordered[1].id).toBe('two-cold');
  });
  it('lokalna poprawa odległości nie zamienia sąsiadujących grup', () => {
    const s = seed(); const point = s.couriers[0].location;
    s.businesses[0].entryPoint = { lat: point.lat + 0.1, lng: point.lng };
    s.businesses[1].entryPoint = { ...point };
    expect(orderDeliveries([delivery('two', 2, 'business2'), delivery('one', 1)], s).map(d => d.id)).toEqual(['one', 'two']);
  });
  it('brak priorytetów i jednolity priorytet zachowują tę samą pozostałą logikę', () => {
    const s = seed(); const ds = [{ ...delivery('standard', 0), cargoType: 'standard' as const }, { ...delivery('cold', 0, 'business2'), cargoType: 'cold' as const }];
    expect(orderDeliveries(ds, s).map(d => d.id)).toEqual(['cold', 'standard']);
    expect(orderDeliveries(ds.map(d => ({ ...d, priority: 1 })), s).map(d => d.id)).toEqual(orderDeliveries(ds, s).map(d => d.id));
    expect(loadingGroups(ds).mode).toBe('free'); expect(loadingGroups(ds.map(d => ({ ...d, priority: 1 }))).mode).toBe('free');
  });
  it('planner nie łączy w jednym postoju różnych priorytetów tego samego miejsca', () => {
    const s = seed(); s.deliveries = [delivery('one-a', 1), delivery('two', 2), delivery('one-b', 1), delivery('none', 0)]; plan(s, s.planningDate);
    expect(s.stops.map(st => st.deliveryIds.map(id => s.deliveries.find(d => d.id === id)!.priority))).toEqual([[1, 1], [2], [0]]);
    const route = s.routes[0]; expect(route.loadingMode).toBe('grouped'); expect(route.loadingGroups?.map(g => g.priority)).toEqual([0, 2, 1]);
    expect(route.loadingList).toEqual(['none', 'two', 'one-a', 'one-b']); // Paczki w grupie 1 nie są sztywno odwracane.
  });
  it.each([0, 1])('załadunek jednolitej grupy %s jest swobodny', priority => {
    const s = seed(); s.deliveries = [delivery('b', priority), delivery('a', priority, 'business2')]; plan(s, s.planningDate);
    expect(s.routes[0].loadingMode).toBe('free'); expect(s.routes[0].loadingGroups).toHaveLength(1); expect(new Set(s.routes[0].loadingList)).toEqual(new Set(['a', 'b']));
  });
  it('brama i zgoda na jazdę nie omijają niższej grupy, nawet gdy wyższa ma wcześniejszy slot', () => {
    const s = seed(); s.deliveries = [delivery('one', 1), delivery('two', 2, 'business2')]; plan(s, s.planningDate);
    const [one, two] = s.stops; s.now = Math.max(...s.reservations.map(r => r.start)); s.closedDeliveryDates = [s.planningDate];
    two.plannedArrival = one.plannedArrival - 10 * MINUTE; s.couriers[0].status = 'gate'; s.couriers[0].targetStopId = two.id;
    expect(decideGate(s, 'courier1').stopId).toBe(one.id); expect(canDrive(s, two, 0)).toBe(false);
    one.status = 'waiting'; expect(decideGate(s, 'courier1').stopId).toBeUndefined();
    one.status = 'done'; expect(decideGate(s, 'courier1').stopId).toBe(two.id); expect(canDrive(s, two, 0)).toBe(true);
  });
  it('naprawa opóźnienia nie przełącza celu na wyższą grupę', () => {
    const s = seed(); s.deliveries = [delivery('one', 1), delivery('two', 2, 'business2')]; plan(s, s.planningDate);
    const stop = s.stops[0], res = s.reservations.find(r => r.stopId === stop.id)!;
    s.now = res.start; s.couriers[0].status = 'gate'; s.couriers[0].targetStopId = stop.id; s.candidateSince[res.id] = s.now - 10 * MINUTE;
    const result = repairPlan(s, { id: 'late', reservationId: res.id, type: 'late', expectedMinutes: 20 });
    expect(result.changed).toBe(true); expect(result.next.couriers[0].targetStopId).toBe(stop.id);
  });
  it('brak slotu pierwszej grupy blokuje rezerwację wyższej, a po zakończeniu pozwala ją wznowić', () => {
    const s = seed(); s.deliveries = [delivery('one', 1), delivery('two', 2, 'business2')];
    const firstBays = s.links.filter(l=>l.businessId==='business1').map(l=>l.bayId);
    s.sensors.filter(sensor=>firstBays.includes(sensor.bayId)).forEach(sensor=>sensor.healthy=false);
    plan(s, s.planningDate);
    const [one, two] = s.stops; expect(one.status).toBe('waiting'); expect(two.status).toBe('waiting');
    expect(s.reservations.find(r => r.stopId === two.id)?.status).toBe('suspended');
    s.closedDeliveryDates = [s.planningDate]; s.now = at(s.planningDate, '08:00'); tick(s, 1); expect(two.status).toBe('waiting');
    one.status = 'done'; s.reservations.find(r => r.stopId === one.id)!.status = 'cancelled'; tick(s, 1);
    expect(two.status).toBe('pending'); expect(s.reservations.find(r => r.stopId === two.id)?.status).toBe('confirmed');
  });
  it('migracja starszych numerów usuwa luki, nie przebudowując zapisanych tras', () => {
    const db = openDb(':memory:');
    try {
      const s = seed(); s.deliveries = [delivery('one', 4), delivery('two', 9), delivery('none', 0)];
      Object.assign(s.deliveries[0], { mustFollowDeliveryId: 'two' });
      s.now=at(s.planningDate,'00:00');
      s.routes = [{ id: 'existing', courierId: 'courier1', vehicleId: 'vehicle1', date: s.planningDate, stopIds: [], breaks: [], loadingList: ['none', 'two', 'one'] }];
      db.prepare('INSERT INTO state VALUES (1,?)').run(JSON.stringify(s)); db.pragma('user_version = 3');
      const repo = new Repo(db, seed); expect(repo.read().deliveries.map(d => d.priority)).toEqual([1, 2, 0]); expect(repo.read().routes).toEqual(s.routes);
      expect(repo.read().deliveries[0]).not.toHaveProperty('mustFollowDeliveryId');
      expect(new Repo(db, seed).read()).toEqual(repo.read()); expect(db.pragma('user_version', { simple: true })).toBe(5);
    } finally { db.close(); }
  });
});

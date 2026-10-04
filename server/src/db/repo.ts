import type Database from 'better-sqlite3';
import type { State, Reservation } from '@histereza/shared/types';
import { deliverySchemaFor, roleSchema } from '@histereza/shared/schemas';
import { existsSync } from 'node:fs';
import { migrateState, migrateBusinessOwnership, migratePriorities, migrateDeliveryDates, MODEL_VERSION } from './migrations';
import { assertPriorities } from '@histereza/shared/priorities';
import { closeDueDeliveryDays } from '../services/deliveryCutoff';
export class Repo {
  constructor(public db: Database.Database, seed: () => State) {
    if (!db.prepare('SELECT id FROM state WHERE id=1').get()) this.save(seed());
    else if (Number(db.pragma('user_version', { simple: true })) < MODEL_VERSION) {
      if (db.name !== ':memory:') {
        const backup = `${db.name}.pre-model-v${MODEL_VERSION}.sqlite`;
        if (!existsSync(backup)) db.prepare('VACUUM INTO ?').run(backup);
      }
      const version = Number(db.pragma('user_version', { simple: true }));
      this.save(migrateDeliveryDates(migratePriorities(version < 2 ? migrateState(this.read()) : migrateBusinessOwnership(this.read()))));
    }
    this.mutate(() => {});
  }
  read(): State { return JSON.parse((this.db.prepare('SELECT payload FROM state WHERE id=1').get() as {payload: string}).payload); }
  insertReservation(r: Reservation) { this.db.prepare('INSERT INTO reservations VALUES (@id,@bayId,@stopId,@externalParkingId,@vehicleId,@deliveryIds,@start,@end,@status,@version)').run({ ...r, stopId: r.stopId ?? null, externalParkingId: r.externalParkingId ?? null, vehicleId: r.vehicleId ?? null, deliveryIds: JSON.stringify(r.deliveryIds) }); }
  save(s: State) {
    const schema = deliverySchemaFor(s);
    const deliveries = s.deliveries.map(d => schema.parse(d));
    assertPriorities(deliveries);
    s.users.forEach(u => roleSchema.parse(u.role));
    if (s.organizations.some(o => o.type !== 'carrier')) throw new Error('Nieobsługiwany typ organizacji');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM deliveries').run();
      this.db.prepare('DELETE FROM businesses').run();
      this.db.prepare('DELETE FROM vehicles').run();
      this.db.prepare('DELETE FROM couriers').run();
      const businessInsert = this.db.prepare('INSERT INTO businesses VALUES (?,?,?)');
      s.businesses.forEach(b => businessInsert.run(b.id, b.name, JSON.stringify(b)));
      const vehicleInsert = this.db.prepare('INSERT INTO vehicles VALUES (?,?)');
      s.vehicles.forEach(v => vehicleInsert.run(v.id, JSON.stringify(v)));
      const courierInsert = this.db.prepare('INSERT INTO couriers VALUES (?,?)');
      s.couriers.forEach(c => courierInsert.run(c.id, JSON.stringify(c)));
      const deliveryInsert = this.db.prepare('INSERT INTO deliveries VALUES (@id,@businessId,@businessName,@date,@cargoType,@vehicleId,@courierId,@priority,@payload)');
      deliveries.forEach(d => deliveryInsert.run({ ...d, payload: JSON.stringify(d) }));
      this.db.prepare('DELETE FROM reservations').run();
      for (const r of s.reservations) this.insertReservation(r);
      this.db.prepare('INSERT INTO state VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify({ ...s, deliveries }));
      this.db.pragma(`user_version = ${MODEL_VERSION}`);
    }).immediate();
  }
  mutate<T>(fn: (s: State) => T): T {
    return this.db.transaction(() => { const s = this.read(); closeDueDeliveryDays(s); const result = fn(s); closeDueDeliveryDays(s); this.save(s); return result; }).immediate();
  }
}

import type Database from 'better-sqlite3';
import type { State, Reservation } from '@histereza/shared/types';
export class Repo {
  constructor(public db: Database.Database, seed: () => State) { if (!db.prepare('SELECT id FROM state WHERE id=1').get()) this.save(seed()); }
  read(): State { return JSON.parse((this.db.prepare('SELECT payload FROM state WHERE id=1').get() as {payload: string}).payload); }
  insertReservation(r: Reservation) { this.db.prepare('INSERT INTO reservations VALUES (@id,@bayId,@stopId,@externalParkingId,@vehicleId,@deliveryIds,@start,@end,@status,@version)').run({ ...r, stopId: r.stopId ?? null, externalParkingId: r.externalParkingId ?? null, vehicleId: r.vehicleId ?? null, deliveryIds: JSON.stringify(r.deliveryIds) }); }
  save(s: State) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM reservations').run();
      for (const r of s.reservations) this.insertReservation(r);
      this.db.prepare('INSERT INTO state VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(JSON.stringify(s));
    }).immediate();
  }
  mutate<T>(fn: (s: State) => T): T {
    return this.db.transaction(() => { const s = this.read(); const result = fn(s); this.save(s); return result; }).immediate();
  }
}

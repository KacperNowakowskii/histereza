PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS businesses (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0), payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS couriers (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries (
 id TEXT PRIMARY KEY,
 businessId TEXT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
 businessName TEXT NOT NULL CHECK(length(trim(businessName)) > 0),
 date TEXT NOT NULL,
 cargoType TEXT NOT NULL CHECK(cargoType IN ('standard','fresh','cold')),
 vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
 courierId TEXT NOT NULL REFERENCES couriers(id) ON DELETE RESTRICT,
 priority INTEGER NOT NULL CHECK(typeof(priority) = 'integer' AND priority >= 0),
 payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deliveries_business ON deliveries(businessId);
CREATE INDEX IF NOT EXISTS deliveries_vehicle ON deliveries(vehicleId);
CREATE TABLE IF NOT EXISTS reservations (
 id TEXT PRIMARY KEY, bayId TEXT NOT NULL, stopId TEXT, externalParkingId TEXT,
 vehicleId TEXT, deliveryIds TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL,
 status TEXT NOT NULL, version INTEGER NOT NULL,
 CHECK(end > start), CHECK((stopId IS NOT NULL AND vehicleId IS NOT NULL AND deliveryIds != '[]') OR externalParkingId IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reservation_calendar ON reservations(bayId,start,end,status);
CREATE TRIGGER IF NOT EXISTS no_overlap_insert BEFORE INSERT ON reservations
WHEN NEW.status='confirmed' BEGIN
 SELECT RAISE(ABORT, 'Konflikt rezerwacji lub bufora') WHERE EXISTS (
 SELECT 1 FROM reservations r WHERE r.bayId=NEW.bayId AND r.status IN ('confirmed','completed')
 AND NEW.start < r.end + 300000 AND NEW.end + 300000 > r.start);
END;
CREATE TRIGGER IF NOT EXISTS no_overlap_update BEFORE UPDATE ON reservations
WHEN NEW.status='confirmed' BEGIN
 SELECT RAISE(ABORT, 'Konflikt rezerwacji lub bufora') WHERE EXISTS (
 SELECT 1 FROM reservations r WHERE r.id != NEW.id AND r.bayId=NEW.bayId AND r.status IN ('confirmed','completed')
 AND NEW.start < r.end + 300000 AND NEW.end + 300000 > r.start);
END;

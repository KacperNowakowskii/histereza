import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function openDb(path = fileURLToPath(new URL('../../data/demo.sqlite', import.meta.url))) {
  if (path !== ':memory:') mkdirSync(fileURLToPath(new URL('../../data', import.meta.url)), { recursive: true });
  const db = new Database(path); db.pragma('busy_timeout = 5000');
  db.exec(readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8')); return db;
}

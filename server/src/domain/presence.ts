import type { Point, SensorReading } from '@histereza/shared/types';
import { distance } from './geo';
import { MINUTE } from '@histereza/shared/config';
export function presence(gps: Point, bay: Point, sensor: SensorReading, confirmed: boolean, online: boolean, now: number) {
  if (!online || !sensor.healthy) return { present: false, reason: 'Brak sieci lub awaria czujnika — bez kar' };
  if (now - sensor.ts > 2 * MINUTE) return { present: false, reason: 'Odczyt czujnika nieaktualny' };
  const nearby = distance(gps, bay) <= 60;
  return { present: nearby && sensor.occupied && confirmed, reason: nearby && sensor.occupied && confirmed ? 'GPS + czujnik + potwierdzenie' : sensor.occupied && !nearby ? 'Zajęte bez kuriera' : 'Brak potwierdzonej obecności' };
}

import type { Point } from '@histereza/shared/types';
export function distance(a: Point, b: Point) {
  const rad = (v: number) => v * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const travelMin = (a: Point, b: Point, speedKmh = 18) => Math.max(1, Math.ceil(distance(a, b) * 1.4 / (speedKmh * 1000 / 60)));

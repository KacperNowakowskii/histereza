import { z } from 'zod';
import type { Business } from './types';
const identifier = z.string().trim().min(1).max(100);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const businessInputSchema = z.object({
  id: identifier, name: z.string().trim().min(1).max(200),
  entryPoint: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict(),
  workingHours: z.array(z.object({ from: time, to: time }).strict()).min(1).max(8),
  unloadingConditions: z.string().trim().max(1000), unattendedDropAllowed: z.boolean(),
  bayIds: z.array(identifier).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Miejsca nie mogą się powtarzać'),
}).strict();
export const vehicleModelInputSchema = z.object({
  name: z.string().trim().min(1).max(120), lengthM: z.number().positive().max(30),
  widthM: z.number().positive().max(5), heightM: z.number().positive().max(6),
  maxLoadKg: z.number().nonnegative().max(50000), gvwKg: z.number().positive().max(60000),
}).strict().refine(m => m.maxLoadKg <= m.gvwKg, 'Ładowność nie może przekraczać DMC');
export const fleetInputSchema = z.object({
  id: identifier, registrationNumber: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9 -]+$/),
  fuelType: z.enum(['petrol', 'diesel', 'electric']), emissionStandard: z.number().int().min(0).max(7),
  productionYear: z.number().int().min(1900).max(2100), hasCooling: z.boolean(), dimensionsVerified: z.boolean(),
  model: vehicleModelInputSchema,
}).strict();
export type BusinessInput = z.infer<typeof businessInputSchema>;
export type FleetInput = z.infer<typeof fleetInputSchema>;
export const normalizeName = (text: string) => text.normalize('NFKC').trim().toLocaleLowerCase('pl');
export function businessMatches(businesses: Business[], query: { id?: string; name?: string }) {
  return businesses.filter(b => (!query.id || b.id === query.id.trim()) && (!query.name || normalizeName(b.name) === normalizeName(query.name)));
}

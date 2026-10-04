import { z } from 'zod';
import type { State } from './types';
export const roleSchema = z.enum(['dispatcher', 'courier', 'business', 'public', 'operator', 'sim']);
export const prioritySchema = z.number().int().nonnegative().safe();
const idSchema = z.string().trim().min(1);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Nieprawidłowa data');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const deliveryFields = {
  businessId: idSchema,
  businessName: z.string().trim().min(1),
  date: dateSchema,
  cargoType: z.enum(['standard', 'fresh', 'cold']),
  vehicleId: idSchema,
  courierId: z.string().trim().min(1, 'Wymagany przypisany kurier'),
  priority: prioritySchema.default(0),
};
export const deliverySchema = z.object({
  id: idSchema, externalRef: idSchema, carrierOrgId: idSchema, ...deliveryFields,
  workingHours: z.array(z.object({ from: timeSchema, to: timeSchema })).min(1).optional(),
  status: z.enum(['imported', 'planned', 'delivered', 'closed']), statusReason: z.string().optional(),
}).strict();
export function deliverySchemaFor(ref: Pick<State, 'businesses' | 'vehicles' | 'couriers'>) {
  return deliverySchema.superRefine((delivery, ctx) => {
    const business = ref.businesses.find(b => b.id === delivery.businessId);
    if (!business) ctx.addIssue({ code: 'custom', path: ['businessId'], message: 'Nieznany biznes' });
    else if (business.name !== delivery.businessName) ctx.addIssue({ code: 'custom', path: ['businessName'], message: 'Nazwa nie odpowiada biznesowi o wskazanym ID' });
    if (!ref.vehicles.some(v => v.id === delivery.vehicleId)) ctx.addIssue({ code: 'custom', path: ['vehicleId'], message: 'Nieznany pojazd we flocie' });
    if (!ref.couriers.some(c => c.id === delivery.courierId)) ctx.addIssue({ code: 'custom', path: ['courierId'], message: 'Nieznany przypisany kurier' });
  });
}
const csvOptional = z.string().trim().optional();
export const csvRowSchema = z.object({
  externalRef: idSchema, date: dateSchema, cargoType: deliveryFields.cargoType, courierId: deliveryFields.courierId,
  priority: z.string().trim().regex(/^\d*$/, 'Priorytet musi być pusty albo liczbą całkowitą od 1').optional().default('').transform(value => value ? Number(value) : 0).pipe(prioritySchema),
  businessId: csvOptional, businessName: csvOptional, vehicleId: csvOptional, registrationNumber: csvOptional,
  opens: csvOptional, closes: csvOptional, businessLat: csvOptional, businessLng: csvOptional,
  bayIds: csvOptional, unloadingConditions: csvOptional, unattendedDropAllowed: csvOptional,
  vehicleModelId: csvOptional, vehicleModelName: csvOptional, lengthM: csvOptional, widthM: csvOptional,
  heightM: csvOptional, maxLoadKg: csvOptional, gvwKg: csvOptional, fuelType: csvOptional,
  emissionStandard: csvOptional, productionYear: csvOptional, hasCooling: csvOptional, dimensionsVerified: csvOptional,
}).strict();
export const actionSchema = z.object({ action: z.enum(['vehicle', 'load', 'depart', 'drive', 'arrive', 'deliver', 'leave', 'ack', 'cannot', 'closed', 'problem', 'plan-break', 'plan-fuel', 'finish-break']), vehicleId: z.string().optional(), reason: z.string().optional(), minutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30)]).optional() });
export const reasonSchema = z.enum(['blocked', 'break', 'vehicle-failure']);
export const registrationSchema = z.string().trim().min(3).max(14).regex(/^[A-Za-z0-9 -]+$/);

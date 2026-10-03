import { z } from 'zod';
export const csvRowSchema = z.object({
  externalRef: z.string().trim().min(1), businessId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cargoType: z.enum(['standard', 'fresh', 'cold']),
  quantity: z.coerce.number().int().positive().max(1000), courierId: z.string().trim().min(1, 'Wymagany przypisany kurier'),
  vehicleId: z.string().trim().min(1), mustFollow: z.string().trim().optional().default(''),
  opens: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), closes: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export const actionSchema = z.object({ action: z.enum(['vehicle', 'load', 'depart', 'drive', 'arrive', 'deliver', 'leave', 'ack', 'cannot', 'closed']), vehicleId: z.string().optional(), reason: z.string().optional() });
export const reasonSchema = z.enum(['blocked', 'load-order', 'break', 'vehicle-failure']);
export const registrationSchema = z.string().trim().min(3).max(14).regex(/^[A-Za-z0-9 -]+$/);

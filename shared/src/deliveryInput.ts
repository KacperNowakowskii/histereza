import { z } from 'zod';
import { dateSchema, timeSchema, prioritySchema } from './schemas';
import { businessInputSchema, fleetInputSchema } from './catalog';
const optionalId = z.string().trim().min(1).max(100).optional();
export const deliveryInputSchema = z.object({
  externalRef: z.string().trim().min(1).max(100), date: dateSchema,
  cargoType: z.enum(['standard', 'fresh', 'cold']), courierId: z.string().trim().min(1), priority: prioritySchema.default(0),
  businessId: optionalId, businessName: z.string().trim().min(1).max(200).optional(),
  vehicleId: optionalId, registrationNumber: z.string().trim().min(3).max(20).optional(),
  workingHours: z.array(z.object({ from: timeSchema, to: timeSchema }).strict()).min(1).max(8).optional(),
  newBusiness: businessInputSchema.omit({ id: true }).extend({ id: optionalId }).optional(),
  newVehicle: fleetInputSchema.omit({ id: true }).extend({ id: optionalId }).optional(),
}).strict();
export type DeliveryInput = z.infer<typeof deliveryInputSchema>;

import type { State, Delivery, ServiceTimeHistory } from '@histereza/shared/types';
import { roleSchema, deliverySchema } from '@histereza/shared/schemas';
import { priorityScope, priorityLevels } from '@histereza/shared/priorities';
import { systemDay } from '@histereza/shared/deliveryDates';

export const MODEL_VERSION = 5;
export function migrateDeliveryDates(input: State): State {
  const s = structuredClone(input); const today = systemDay(s.now);
  delete (s as State & { cutoffApplied?: unknown }).cutoffApplied;
  const futureRoutes = new Set(s.routes.filter(r => r.date > today).map(r => r.id));
  const futureStops = new Set(s.stops.filter(st => futureRoutes.has(st.routeId)).map(st => st.id));
  const futureCouriers = new Set(s.routes.filter(r => futureRoutes.has(r.id)).map(r => r.courierId));
  s.routes = s.routes.filter(r => !futureRoutes.has(r.id)); s.stops = s.stops.filter(st => !futureStops.has(st.id));
  s.reservations = s.reservations.filter(r => !r.stopId || !futureStops.has(r.stopId));
  const reservations = new Set(s.reservations.map(r => r.id));
  s.usage = s.usage.filter(u => reservations.has(u.reservationId)); s.predictions = s.predictions.filter(p => reservations.has(p.reservationId));
  s.changes = s.changes.filter(c => !futureRoutes.has(c.routeId));
  s.candidateSince = Object.fromEntries(Object.entries(s.candidateSince).filter(([id]) => reservations.has(id)));
  for (const d of s.deliveries) if (d.date > today && d.status === 'planned') d.status = 'imported';
  for (const c of s.couriers) if (futureCouriers.has(c.id) && !s.routes.some(r => r.courierId === c.id && r.date === today)) { c.status = 'idle'; c.loaded = false; delete c.targetStopId; delete c.vehicleId; }
  s.closedDeliveryDates = [...new Set([...(s.closedDeliveryDates ?? []).filter(date => date <= today), ...s.routes.map(r => r.date)])];
  return s;
}
const currentDelivery = (d: Delivery) => Object.fromEntries(Object.entries(d).filter(([key]) => Object.hasOwn(deliverySchema.shape, key))) as unknown as Delivery;
/** Zachowuje relację starszych numerów, zamieniając luki na ciąg 1..N. */
export function migratePriorities(input: State): State {
  const s = structuredClone(input);
  s.deliveries = s.deliveries.map(currentDelivery);
  for (const key of new Set(s.deliveries.map(priorityScope))) {
    const group = s.deliveries.filter(d => priorityScope(d) === key); const levels = priorityLevels(group);
    for (const d of group) d.priority = d.priority > 0 ? levels.indexOf(d.priority) + 1 : 0;
  }
  return s;
}
export function migrateBusinessOwnership(input: State): State {
  const s = structuredClone(input);
  for (const b of s.businesses) {
    if (!b.orgId) b.orgId = s.organizations.some(o => o.id === b.hoursSourceOrgId) ? b.hoursSourceOrgId : s.organizations[0]?.id;
    if (!b.orgId) throw new Error(`Migracja: brak firmy dla biznesu ${b.id}`);
  }
  return s;
}

/** Migracja starego dokumentu; istniejące przypisania kurierów firmowych pozostają bez zmian. */
export function migrateState(input: State): State {
  const s = structuredClone(input);
  const organizations = new Set(s.organizations.filter(o => o.type === 'carrier').map(o => o.id));
  s.organizations = s.organizations.filter(o => organizations.has(o.id));
  const removedUsers = new Set(s.users.filter(u => !organizations.has(u.orgId) || !roleSchema.safeParse(u.role).success).map(u => u.id));
  s.users = s.users.filter(u => !removedUsers.has(u.id));
  const removedCouriers = new Set(s.couriers.filter(c => !organizations.has(c.orgId) || removedUsers.has(c.userId)).map(c => c.id));
  s.couriers = s.couriers.filter(c => !removedCouriers.has(c.id));
  for (const c of s.couriers) c.constraints = c.constraints.filter(reason => ['blocked', 'break', 'vehicle-failure'].includes(reason));
  s.vehicles = s.vehicles.filter(v => organizations.has(v.orgId));
  s.deliveries = s.deliveries.filter(d => organizations.has(d.carrierOrgId) && !removedCouriers.has(d.courierId)).map(d => {
    // Projekcja na aktualny model usuwa wszystkie dawne pola i zależności.
    const delivery = currentDelivery(d);
    const business = s.businesses.find(b => b.id === delivery.businessId);
    if (!business) throw new Error(`Migracja: nieznany biznes ${delivery.businessId}`);
    return { ...delivery, businessName: business.name, priority: delivery.priority ?? 0 };
  });
  s.history = s.history.map(h => {
    const { quantity, ...history } = h as ServiceTimeHistory & { quantity?: unknown };
    return history;
  });
  s.routes = s.routes.filter(r => !removedCouriers.has(r.courierId));
  const routes = new Set(s.routes.map(r => r.id));
  s.stops = s.stops.filter(st => routes.has(st.routeId));
  const stops = new Set(s.stops.map(st => st.id));
  s.reservations = s.reservations.filter(r => !r.stopId || stops.has(r.stopId));
  const reservations = new Set(s.reservations.map(r => r.id));
  s.usage = s.usage.filter(u => organizations.has(u.orgId) && reservations.has(u.reservationId));
  s.predictions = s.predictions.filter(p => reservations.has(p.reservationId));
  s.changes = s.changes.filter(c => routes.has(c.routeId));
  s.notifications = s.notifications.filter(n => !removedUsers.has(n.userId));
  s.events = s.events.filter(e => !removedUsers.has(e.actorId) && !removedCouriers.has(e.actorId));
  s.candidateSince = Object.fromEntries(Object.entries(s.candidateSince).filter(([id]) => reservations.has(id)));
  return migrateBusinessOwnership(s);
}

import { createHash } from 'node:crypto';
import type { State, Delivery } from '@histereza/shared/types';
import { deliveryInputSchema } from '@histereza/shared/deliveryInput';
import { deliverySchemaFor } from '@histereza/shared/schemas';
import { normalizeName } from '@histereza/shared/catalog';
import { CONFIG } from '@histereza/shared/config';
import { systemDay, dayDistance, declarationsClosed, declarationDeadlineMessage } from '@histereza/shared/deliveryDates';
import { vehicleReason } from '../domain/vehicles';
import { company, saveBusiness, saveVehicle } from './catalogService';
import { event } from './dayService';
import { assertPriorities } from '@histereza/shared/priorities';

const generatedId = (kind: string, orgId: string, value: string) => `${kind}:${orgId}:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
const plate = (value: string) => normalizeName(value.replace(/\s/g, ''));
export function editableDelivery(s: State, orgId: string, id: string) {
  company(s, orgId);
  const d = s.deliveries.find(d => d.id === id && d.carrierOrgId === orgId);
  if (!d) throw new Error('Dostawa nie istnieje lub nie należy do firmy');
  if (declarationsClosed(s.now, d.date, s.closedDeliveryDates)) throw new Error(declarationDeadlineMessage(d.date));
  if (d.status !== 'imported' || s.stops.some(st => st.deliveryIds.includes(id)) || s.routes.some(r => r.loadingList.includes(id)) || s.reservations.some(r => r.deliveryIds.includes(id))) throw new Error('Można zmieniać wyłącznie przygotowane dostawy, które nie weszły do planu');
  return d;
}
/** Wspólny resolver CSV i formularza. Wywoływany na roboczej kopii stanu. */
export function prepareDelivery(s: State, orgId: string, input: unknown, editingId?: string): Delivery {
  company(s, orgId); if (!s.online) throw new Error('Nie można zapisywać dostaw offline');
  const r = deliveryInputSchema.parse(input);
  if (declarationsClosed(s.now, r.date, s.closedDeliveryDates)) throw new Error(declarationDeadlineMessage(r.date));
  const previous = editingId ? editableDelivery(s, orgId, editingId) : undefined;
  if (previous && previous.externalRef !== r.externalRef) throw new Error('Numer dostawy jest niezmienny podczas edycji');
  if (s.deliveries.some(d => d.id !== editingId && d.carrierOrgId === orgId && d.externalRef === r.externalRef)) throw new Error('Powtórzony numer dostawy');
  const diff = dayDistance(systemDay(s.now), r.date);
  if (diff < 1 || diff > CONFIG.PLANNING_DAYS) throw new Error('Data poza horyzontem trzech kolejnych dni');
  if (!s.couriers.some(c => c.id === r.courierId && c.orgId === orgId)) throw new Error('Kurier nie istnieje lub nie należy do firmy');

  if (r.businessId && r.newBusiness?.id && r.businessId !== r.newBusiness.id || r.businessName && r.newBusiness && normalizeName(r.businessName) !== normalizeName(r.newBusiness.name)) throw new Error('Sprzeczne dane nowego biznesu');
  const businessId = r.businessId ?? r.newBusiness?.id; const businessName = r.businessName ?? r.newBusiness?.name;
  let business = businessId ? s.businesses.find(b => b.id === businessId) : undefined;
  const names = businessName ? s.businesses.filter(b => b.orgId === orgId && normalizeName(b.name) === normalizeName(businessName)) : [];
  if (business && business.orgId !== orgId) throw new Error('Biznes nie należy do firmy');
  if (business && businessName && normalizeName(business.name) !== normalizeName(businessName)) throw new Error('ID i nazwa biznesu są sprzeczne');
  if (!business && businessId && names.length) throw new Error('ID i nazwa wskazują różne biznesy');
  if (!business && !businessId && names.length > 1) throw new Error('Nazwa biznesu jest niejednoznaczna; podaj ID');
  if (!business && names.length === 1) business = names[0];
  if (business && r.newBusiness) throw new Error('Biznes już istnieje; wybierz rekord z bazy');
  if (!business) {
    if (!r.newBusiness) throw new Error('Nieznany biznes; podaj nazwę, lokalizację, godziny i miejsca, aby go utworzyć');
    business = saveBusiness(s, orgId, { ...r.newBusiness, id: businessId ?? generatedId('business', orgId, normalizeName(r.newBusiness.name)) });
  }

  if (r.vehicleId && r.newVehicle?.id && r.vehicleId !== r.newVehicle.id || r.registrationNumber && r.newVehicle && plate(r.registrationNumber) !== plate(r.newVehicle.registrationNumber)) throw new Error('Sprzeczne dane nowego pojazdu');
  const vehicleId = r.vehicleId ?? r.newVehicle?.id; const registration = r.registrationNumber ?? r.newVehicle?.registrationNumber;
  let vehicle = vehicleId ? s.vehicles.find(v => v.id === vehicleId) : undefined;
  const registrations = registration ? s.vehicles.filter(v => v.orgId === orgId && plate(v.registrationNumber) === plate(registration)) : [];
  if (vehicle && vehicle.orgId !== orgId) throw new Error('Pojazd nie należy do firmy');
  if (vehicle && registration && plate(vehicle.registrationNumber) !== plate(registration)) throw new Error('ID pojazdu i rejestracja są sprzeczne');
  if (!vehicle && vehicleId && registrations.length) throw new Error('ID pojazdu i rejestracja wskazują różne rekordy');
  if (!vehicle && !vehicleId && registrations.length > 1) throw new Error('Rejestracja pojazdu jest niejednoznaczna; podaj ID');
  if (!vehicle && registrations.length === 1) vehicle = registrations[0];
  if (vehicle && r.newVehicle) throw new Error('Pojazd już istnieje; wybierz rekord z floty');
  if (!vehicle) {
    if (!r.newVehicle) throw new Error('Nieznany pojazd; podaj rejestrację, model i wymagane dane techniczne');
    vehicle = saveVehicle(s, orgId, { ...r.newVehicle, id: vehicleId ?? generatedId('vehicle', orgId, plate(r.newVehicle.registrationNumber)) });
  }
  const d: Delivery = { id: previous?.id ?? `${orgId}:${r.externalRef}`, externalRef: r.externalRef, carrierOrgId: orgId, businessId: business.id, businessName: business.name, date: r.date, cargoType: r.cargoType, courierId: r.courierId, vehicleId: vehicle.id, priority: r.priority, workingHours: r.workingHours ?? structuredClone(business.workingHours), status: 'imported' };
  deliverySchemaFor(s).parse(d);
  const others = s.deliveries.filter(x => x.id !== editingId && x.courierId === d.courierId && x.date === d.date);
  if (others.some(x => x.vehicleId !== d.vehicleId)) throw new Error('Kurier ma różne pojazdy w jednym dniu');
  const why = vehicleReason({ ...s, planningDate: d.date }, vehicle, [...others, d]); if (why) throw new Error(why);
  return d;
}
export function saveDelivery(s: State, orgId: string, input: unknown, editingId?: string) {
  const next = structuredClone(s); const d = prepareDelivery(next, orgId, input, editingId);
  if (editingId) next.deliveries[next.deliveries.findIndex(x => x.id === editingId)] = d; else next.deliveries.push(d);
  assertPriorities(next.deliveries);
  event(next, editingId ? 'delivery-updated' : 'delivery-created', orgId, { id: d.id }); Object.assign(s, next); return d;
}
export function deleteDelivery(s: State, orgId: string, id: string) {
  if (!s.online) throw new Error('Nie można usuwać dostaw offline'); editableDelivery(s, orgId, id);
  const remaining = s.deliveries.filter(d => d.id !== id); assertPriorities(remaining);
  s.deliveries = remaining; event(s, 'delivery-deleted', orgId, { id }); return { ok: true };
}

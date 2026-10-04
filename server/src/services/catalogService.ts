import type { State, VehicleModel } from '@histereza/shared/types';
import { businessInputSchema, fleetInputSchema, businessMatches, normalizeName } from '@histereza/shared/catalog';
import { distance } from '../domain/geo';
import { event } from './dayService';
export function company(s: State, orgId: string) {
  if (!s.organizations.some(o => o.id === orgId)) throw new Error('Nieznana firma');
}
export function listBusinesses(s: State, orgId: string) { company(s, orgId); return s.businesses.filter(b => b.orgId === orgId).map(b => ({ ...b, links: s.links.filter(l => l.businessId === b.id) })); }
export function lookupBusiness(s: State, orgId: string, query: { id?: string; name?: string }) {
  const matches = businessMatches(listBusinesses(s, orgId), query);
  return { matches, business: matches.length === 1 ? matches[0] : null };
}
export function saveBusiness(s: State, orgId: string, input: unknown, editingId?: string) {
  company(s, orgId); if (!s.online) throw new Error('Brak sieci — zapis niedostępny');
  const data = businessInputSchema.parse(input); const existing = s.businesses.find(b => b.id === (editingId ?? data.id));
  if (editingId && (!existing || existing.orgId !== orgId)) throw new Error('Biznes nie należy do tej firmy');
  if (editingId && data.id !== editingId) throw new Error('ID biznesu jest niezmienne');
  if (!editingId && existing) throw new Error('ID biznesu już istnieje');
  if (data.bayIds.some(id => !s.bays.some(b => b.id === id))) throw new Error('Nieznane miejsce dostaw');
  const before = existing ? structuredClone(existing) : null;
  const oldLinks = s.links.filter(l => l.businessId === data.id).map(l => l.bayId).sort();
  const linksChanged = !existing || JSON.stringify(existing.entryPoint) !== JSON.stringify(data.entryPoint) || JSON.stringify(oldLinks) !== JSON.stringify([...data.bayIds].sort());
  const structural = existing && (linksChanged || JSON.stringify(existing.workingHours) !== JSON.stringify(data.workingHours));
  if (structural && s.stops.some(st => st.status !== 'done' && st.deliveryIds.some(id => s.deliveries.find(d => d.id === id)?.businessId === data.id))) throw new Error('Biznes jest używany w aktywnym planie. Lokalizację, godziny i miejsca można zmienić po zakończeniu dostaw');
  const { bayIds, ...fields } = data;
  const business = { ...fields, orgId, hoursSourceOrgId: orgId };
  if (existing) Object.assign(existing, business); else s.businesses.push(business);
  if (linksChanged) {
    s.links = s.links.filter(l => l.businessId !== data.id);
    for (const bayId of bayIds) { const bay = s.bays.find(b => b.id === bayId)!; const walkingM = Math.ceil(distance(data.entryPoint, bay)); s.links.push({ businessId: data.id, bayId, walkingM, walkingMin: Math.max(1, Math.ceil(walkingM / 80)) }); }
  }
  s.deliveries.filter(d => d.businessId === data.id).forEach(d => d.businessName = data.name);
  event(s, editingId ? 'business-updated' : 'business-created', orgId, { before, after: business });
  return { ...business, links: s.links.filter(l => l.businessId === data.id) };
}
export function deleteBusiness(s: State, orgId: string, id: string) {
  company(s, orgId); if (!s.online) throw new Error('Brak sieci — zapis niedostępny');
  const business = s.businesses.find(b => b.id === id && b.orgId === orgId); if (!business) throw new Error('Biznes nie należy do tej firmy');
  if (s.deliveries.some(d => d.businessId === id)) throw new Error('Nie można usunąć biznesu powiązanego z dostawami');
  s.businesses = s.businesses.filter(b => b.id !== id); s.links = s.links.filter(l => l.businessId !== id); s.history = s.history.filter(h => h.businessId !== id);
  event(s, 'business-deleted', orgId, business); return { ok: true };
}
const modelFields = (m: VehicleModel) => ({ name: m.name ?? m.id, lengthM: m.lengthM, widthM: m.widthM, heightM: m.heightM, maxLoadKg: m.maxLoadKg, gvwKg: m.gvwKg });
export function listFleet(s: State, orgId: string) { company(s, orgId); return s.vehicles.filter(v => v.orgId === orgId).map(v => ({ ...v, model: s.models.find(m => m.id === v.vehicleModelId)! })); }
export function saveVehicle(s: State, orgId: string, input: unknown, editingId?: string) {
  company(s, orgId); if (!s.online) throw new Error('Brak sieci — zapis niedostępny');
  const data = fleetInputSchema.parse(input); const existing = s.vehicles.find(v => v.id === (editingId ?? data.id));
  if (editingId && (!existing || existing.orgId !== orgId)) throw new Error('Pojazd nie należy do tej firmy');
  if (editingId && data.id !== editingId) throw new Error('ID pojazdu jest niezmienne');
  if (!editingId && existing) throw new Error('ID pojazdu już istnieje');
  if (s.vehicles.some(v => v.id !== data.id && normalizeName(v.registrationNumber.replace(/\s/g, '')) === normalizeName(data.registrationNumber.replace(/\s/g, '')))) throw new Error('Numer rejestracyjny już istnieje we flocie');
  const { model: modelInput, ...fields } = data;
  const oldModel = existing ? s.models.find(m => m.id === existing.vehicleModelId)! : undefined;
  const technical = existing && (JSON.stringify(modelFields(oldModel!)) !== JSON.stringify(modelInput) || ['fuelType', 'emissionStandard', 'productionYear', 'hasCooling', 'dimensionsVerified'].some(key => (existing as unknown as Record<string, unknown>)[key] !== (fields as Record<string, unknown>)[key]));
  if (technical && s.routes.some(r => r.vehicleId === data.id && s.stops.some(st => st.routeId === r.id && st.status !== 'done'))) throw new Error('Pojazd jest używany w aktywnym planie. Dane techniczne można zmienić po zakończeniu trasy');
  let model = s.models.find(m => JSON.stringify(modelFields(m)) === JSON.stringify(modelInput));
  if (!model) { let index = s.models.length + 1; let id = `fleet-model:${data.id}:${index}`; while (s.models.some(m => m.id === id)) id = `fleet-model:${data.id}:${++index}`; model = { id, ...modelInput }; s.models.push(model); }
  const before = existing ? structuredClone(existing) : null;
  const vehicle = { ...fields, registrationNumber: fields.registrationNumber.toUpperCase(), orgId, vehicleModelId: model.id };
  if (existing) Object.assign(existing, vehicle); else s.vehicles.push(vehicle);
  event(s, editingId ? 'vehicle-updated' : 'vehicle-created', orgId, { before, after: vehicle }); return { ...vehicle, model };
}
export function deleteVehicle(s: State, orgId: string, id: string) {
  company(s, orgId); if (!s.online) throw new Error('Brak sieci — zapis niedostępny');
  const vehicle = s.vehicles.find(v => v.id === id && v.orgId === orgId); if (!vehicle) throw new Error('Pojazd nie należy do tej firmy');
  if (s.deliveries.some(d => d.vehicleId === id) || s.routes.some(r => r.vehicleId === id) || s.reservations.some(r => r.vehicleId === id) || s.couriers.some(c => c.vehicleId === id)) throw new Error('Nie można usunąć pojazdu powiązanego z dostawami, trasą lub kurierem');
  s.vehicles = s.vehicles.filter(v => v.id !== id); event(s, 'vehicle-deleted', orgId, vehicle); return { ok: true };
}

import Papa from 'papaparse';
import { csvRowSchema } from '@histereza/shared/schemas';
import type { State, Delivery } from '@histereza/shared/types';
import type { DeliveryInput } from '@histereza/shared/deliveryInput';
import { normalizeName } from '@histereza/shared/catalog';
import { prepareDelivery } from '../services/deliveryService';
import { company } from '../services/catalogService';
import { priorityIssues } from '@histereza/shared/priorities';
export interface ImportResult { errors: { row: number; message: string }[]; deliveries: Delivery[]; newBusinessIds: string[]; newVehicleIds: string[] }
type Row = ReturnType<typeof csvRowSchema.parse>;
const number = (value?: string) => value?.trim() ? Number(value) : undefined;
function boolean(value?: string) { if (!value?.trim()) return undefined; if (value === 'true' || value === '1') return true; if (value === 'false' || value === '0') return false; throw new Error('Wartość logiczna musi wynosić true/false lub 1/0'); }
const optional = (value?: string) => value?.trim() || undefined;
function inputFromRow(s: State, orgId: string, r: Row): DeliveryInput {
  const input: DeliveryInput = { externalRef: r.externalRef, date: r.date, cargoType: r.cargoType, courierId: r.courierId, priority: r.priority, businessId: optional(r.businessId), businessName: optional(r.businessName), vehicleId: optional(r.vehicleId), registrationNumber: optional(r.registrationNumber) };
  if (r.opens || r.closes) input.workingHours = [{ from: r.opens ?? '', to: r.closes ?? '' }];
  const b = r.businessId ? s.businesses.find(b => b.id === r.businessId) : s.businesses.find(b => b.orgId === orgId && normalizeName(b.name) === normalizeName(r.businessName ?? ''));
  const bayIds = r.bayIds?.split('|').map(x => x.trim()).filter(Boolean) ?? [];
  if (!b) input.newBusiness = { id: optional(r.businessId), name: r.businessName ?? '', entryPoint: { lat: number(r.businessLat)!, lng: number(r.businessLng)! }, workingHours: input.workingHours ?? [], bayIds, unloadingConditions: r.unloadingConditions ?? '', unattendedDropAllowed: boolean(r.unattendedDropAllowed) ?? false };
  else {
    if (r.businessLat && number(r.businessLat) !== b.entryPoint.lat || r.businessLng && number(r.businessLng) !== b.entryPoint.lng || r.bayIds && JSON.stringify([...bayIds].sort()) !== JSON.stringify(s.links.filter(l => l.businessId === b.id).map(l => l.bayId).sort()) || r.unloadingConditions && r.unloadingConditions !== b.unloadingConditions || r.unattendedDropAllowed && boolean(r.unattendedDropAllowed) !== b.unattendedDropAllowed) throw new Error('Dane biznesu są sprzeczne z bazą');
  }
  const normalizedPlate = (v: string) => normalizeName(v.replace(/\s/g, ''));
  const v = r.vehicleId ? s.vehicles.find(v => v.id === r.vehicleId) : s.vehicles.find(v => v.orgId === orgId && normalizedPlate(v.registrationNumber) === normalizedPlate(r.registrationNumber ?? ''));
  const modelId = optional(r.vehicleModelId), modelName = optional(r.vehicleModelName);
  const modelMatches = s.models.filter(m => (!modelId || m.id === modelId) && (!modelName || normalizeName(m.name ?? m.id) === normalizeName(modelName)));
  const technicalKeys = ['lengthM', 'widthM', 'heightM', 'maxLoadKg', 'gvwKg'] as const;
  if (!v) {
    if (modelId && modelMatches.length !== 1) throw new Error('Nieznany lub sprzeczny model pojazdu');
    if (!modelId && modelName && modelMatches.length > 1) throw new Error('Nazwa modelu jest niejednoznaczna; podaj vehicleModelId');
    const m = modelId || modelName ? modelMatches[0] : undefined;
    if (m && technicalKeys.some(k => r[k] && number(r[k]) !== m[k])) throw new Error('Parametry są sprzeczne z wybranym modelem');
    input.newVehicle = { id: optional(r.vehicleId), registrationNumber: r.registrationNumber ?? '', fuelType: r.fuelType as 'diesel' | 'petrol' | 'electric', emissionStandard: number(r.emissionStandard)!, productionYear: number(r.productionYear)!, hasCooling: boolean(r.hasCooling) ?? false, dimensionsVerified: boolean(r.dimensionsVerified) ?? false, model: { name: m?.name ?? m?.id ?? modelName ?? '', lengthM: m?.lengthM ?? number(r.lengthM)!, widthM: m?.widthM ?? number(r.widthM)!, heightM: m?.heightM ?? number(r.heightM)!, maxLoadKg: m?.maxLoadKg ?? number(r.maxLoadKg)!, gvwKg: m?.gvwKg ?? number(r.gvwKg)! } };
  } else {
    const m = s.models.find(m => m.id === v.vehicleModelId)!;
    if (modelId && modelId !== m.id || modelName && normalizeName(modelName) !== normalizeName(m.name ?? m.id) || technicalKeys.some(k => r[k] && number(r[k]) !== m[k]) || r.fuelType && r.fuelType !== v.fuelType || r.emissionStandard && number(r.emissionStandard) !== v.emissionStandard || r.productionYear && number(r.productionYear) !== v.productionYear || r.hasCooling && boolean(r.hasCooling) !== v.hasCooling || r.dimensionsVerified && boolean(r.dimensionsVerified) !== v.dimensionsVerified) throw new Error('Dane pojazdu są sprzeczne z flotą');
  }
  return input;
}
export function stageImport(s: State, csv: string, orgId: string): { result: ImportResult; state: State } {
  company(s, orgId);
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim() });
  const result: ImportResult = { errors: parsed.errors.map(e => ({ row: (e.row ?? 0) + 2, message: e.message })), deliveries: [], newBusinessIds: [], newVehicleIds: [] };
  if (!parsed.data.length) result.errors.push({ row: 1, message: 'Plik nie zawiera dostaw' });
  let working = structuredClone(s);
  const rowNumbers = new Map<string, number>();
  parsed.data.forEach((row, i) => {
    try {
      const r = csvRowSchema.parse(row); const candidate = structuredClone(working);
      const d = prepareDelivery(candidate, orgId, inputFromRow(candidate, orgId, r));
      candidate.deliveries.push(d); result.deliveries.push(d); rowNumbers.set(d.id, i + 2); working = candidate;
    } catch (e) { result.errors.push({ row: i + 2, message: e instanceof Error ? e.message : 'Błąd danych' }); }
  });
  for (const issue of priorityIssues(working.deliveries)) result.errors.push({ row: rowNumbers.get(issue.deliveryId) ?? 1, message: issue.message });
  result.newBusinessIds = working.businesses.filter(b => !s.businesses.some(old => old.id === b.id)).map(b => b.id);
  result.newVehicleIds = working.vehicles.filter(v => !s.vehicles.some(old => old.id === v.id)).map(v => v.id);
  return { result, state: working };
}
export function validateImport(s: State, csv: string, orgId: string): ImportResult { return stageImport(s, csv, orgId).result; }

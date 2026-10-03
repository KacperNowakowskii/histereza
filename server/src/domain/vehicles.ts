import type { Vehicle, VehicleModel, Bay, State, Delivery } from '@histereza/shared/types';
import { CONFIG } from '@histereza/shared/config';
export function sct(vehicle: Vehicle, date: string): 'allowed' | 'paid' | 'forbidden' {
  const compliant = vehicle.fuelType === 'electric' || (vehicle.fuelType === 'petrol'
    ? vehicle.emissionStandard >= 4 || vehicle.productionYear >= 2005
    : vehicle.emissionStandard >= 6 || vehicle.productionYear >= ((vehicle as Vehicle & { gvwKg?: number }).gvwKg! > 3500 ? 2012 : 2014));
  return compliant ? 'allowed' : date <= CONFIG.SCT_TRANSITION_END ? 'paid' : 'forbidden';
}
export function vehicleSct(v: Vehicle, m: VehicleModel, date: string) { return sct({ ...v, gvwKg: m.gvwKg } as Vehicle, date); }
export const fits = (model: VehicleModel, bay: Bay) => model.lengthM <= bay.lengthM && model.widthM <= bay.widthM;
export function vehicleReason(s: State, v: Vehicle, ds: Delivery[] = []) {
  const m = s.models.find(x => x.id === v.vehicleModelId)!;
  if (!v.dimensionsVerified) return 'Niezweryfikowane wymiary';
  if (!s.bays.some(b => fits(m, b))) return 'Pojazd za duży dla wszystkich miejsc';
  if (vehicleSct(v, m, s.planningDate) === 'forbidden') return 'Zakaz SCT';
  if (ds.some(d => d.cargoType === 'cold') && !v.hasCooling) return 'Wymagana chłodnia';
  if (ds.reduce((a, d) => a + d.quantity * 10, 0) > m.maxLoadKg) return 'Przekroczona ładowność (demo: 10 kg/jednostkę)';
  return undefined;
}

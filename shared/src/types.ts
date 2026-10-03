export type Role = 'dispatcher' | 'courier' | 'independent' | 'business' | 'public' | 'operator' | 'sim';
export interface Organization { id: string; name: string; type: 'carrier' | 'independent'; size: 'small' | 'large' }
export interface User { id: string; orgId: string; role: Role }
export interface Point { lat: number; lng: number }
export interface Courier { id: string; userId: string; orgId: string; regionIds: string[]; status: 'idle' | 'gate' | 'driving' | 'servicing' | 'finished'; location: Point; vehicleId?: string; loaded: boolean; online: boolean; readyAt: number; targetStopId?: string; constraints: string[] }
export interface VehicleModel { id: string; lengthM: number; widthM: number; heightM: number; maxLoadKg: number; gvwKg: number }
export interface Vehicle { id: string; orgId: string; registrationNumber: string; vehicleModelId: string; fuelType: 'petrol' | 'diesel' | 'electric'; emissionStandard: number; productionYear: number; hasCooling: boolean; dimensionsVerified: boolean }
export interface Window { from: string; to: string }
export interface Zone { id: string; name: string; deliveryWindows: Window[]; sct: boolean; speedKmh: number }
export interface Bay extends Point { id: string; name: string; groupId: string; zoneId: string; lengthM: number; widthM: number; status: 'open' | 'closed' }
export interface BayGroup { id: string; bayIds: string[] }
export interface BayFunctionSchedule { bayId: string; day: string; from: string; to: string; function: 'deliveries' | 'parking' | 'garden' | 'micromobility' }
export interface Business { id: string; name: string; entryPoint: Point; workingHours: Window[]; hoursSourceOrgId: string; unloadingConditions: string; unattendedDropAllowed: boolean }
export interface BusinessBayLink { businessId: string; bayId: string; walkingM: number; walkingMin: number }
export interface Delivery { id: string; externalRef: string; carrierOrgId: string; businessId: string; date: string; cargoType: 'standard' | 'fresh' | 'cold'; quantity: number; priorityFlags: string[]; mustFollowDeliveryId?: string; courierId: string; vehicleId: string; workingHours?: Window[]; status: 'imported' | 'planned' | 'delivered' | 'closed'; statusReason?: string }
export interface Route { id: string; courierId: string; vehicleId: string; date: string; stopIds: string[]; breaks: { afterStopId: string; minutes: number }[]; loadingList: string[] }
export interface Stop { id: string; routeId: string; sequence: number; bayGroupId: string; bayId: string; deliveryIds: string[]; plannedArrival: number; plannedServiceMin: number; frozen: boolean; status: 'pending' | 'driving' | 'servicing' | 'done' | 'waiting'; actualArrival?: number; actualDeparture?: number; expectedDeparture?: number; eligibleBayIds: string[]; notBefore?: number }
export interface Reservation { id: string; bayId: string; stopId?: string; externalParkingId?: string; deliveryIds: string[]; vehicleId?: string; start: number; end: number; status: 'confirmed' | 'completed' | 'cancelled' | 'suspended' | 'no-show'; version: number }
export interface ExternalParking { id: string; bayId: string; registrationNumber: string; start: number; allowedUntil: number; status: 'active' | 'ended' | 'overstay' }
export interface CityRule { id: string; type: 'closure'; target: string; params: Record<string, unknown>; validFrom: number; validTo: number }
export interface SensorReading { bayId: string; ts: number; occupied: boolean; healthy: boolean }
export interface Event { id: string; type: string; actorId: string; payload: unknown; ts: number }
export interface Prediction { id: string; reservationId: string; type: string; expectedMinutes: number }
export interface PlanChange { id: string; routeId: string; cause: string; before: unknown; after: unknown; appliedAt: number; acknowledged: boolean; forced: boolean }
export interface Incident { id: string; type: string; bayId: string; evidence: unknown; status: 'open' | 'resolved'; resolution?: string; affectsHistory: false }
export interface ServiceTimeHistory { businessId: string; bayId: string; cargoType: string; quantity: number; durationMin: number; excluded: boolean }
export interface UsageRecord { orgId: string; reservationId: string; units: number }
export interface Notification { id: string; userId: string; text: string; ts: number }
export interface State {
  now: number; planningDate: string; online: boolean; organizations: Organization[]; users: User[]; couriers: Courier[];
  models: VehicleModel[]; vehicles: Vehicle[]; zones: Zone[]; bays: Bay[]; groups: BayGroup[];
  schedules: BayFunctionSchedule[]; businesses: Business[]; links: BusinessBayLink[]; deliveries: Delivery[];
  routes: Route[]; stops: Stop[]; reservations: Reservation[]; external: ExternalParking[]; rules: CityRule[];
  sensors: SensorReading[]; events: Event[]; predictions: Prediction[]; changes: PlanChange[];
  incidents: Incident[]; history: ServiceTimeHistory[]; usage: UsageRecord[]; notifications: Notification[];
  candidateSince: Record<string, number>; cutoffApplied: boolean;
}

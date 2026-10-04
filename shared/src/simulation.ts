import type { State } from './types';
export type DisruptionKind = 'delay' | 'traffic' | 'overstay' | 'occupied' | 'break' | 'fuel';
export interface SimulationRecord { id: string; ts: number; courierId: string; stopId?: string; kind: string; text: string; minutes?: number; reaction?: string }
export interface SimulationView { id: string; mode: 'scenario' | 'random'; scenarioId: string; running: boolean; state: State; records: SimulationRecord[] }
export interface SimulationCatalog { scenarios: {id: string; name: string}[]; organizations: State['organizations']; couriers: State['couriers'] }

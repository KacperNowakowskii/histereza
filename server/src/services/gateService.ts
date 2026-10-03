import type { State } from '@histereza/shared/types';
import { decideGate } from '../domain/gate';
export function gate(s:State,courierId:string){const decision=decideGate(s,courierId);Object.assign(s.couriers.find(c=>c.id===courierId)!,decision.courier);return s.stops.find(st=>st.id===decision.stopId);}

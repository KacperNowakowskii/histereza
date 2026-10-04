import type { State } from '@histereza/shared/types';
import { decideGate } from '../domain/gate';
export function gate(s:State,courierId:string){const decision=decideGate(s,courierId);const c=s.couriers.find(c=>c.id===courierId)!;Object.assign(c,decision.courier);if(!decision.courier.pause)delete c.pause;if(!decision.courier.targetStopId)delete c.targetStopId;return s.stops.find(st=>st.id===decision.stopId);}

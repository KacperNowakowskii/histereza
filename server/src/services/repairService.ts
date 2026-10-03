import type { State,Prediction } from '@histereza/shared/types';
import { repairPlan } from '../domain/repair';
import { applyState } from './stateTransition';
export function repair(s:State,p:Prediction){const result=repairPlan(s,p);applyState(s,result.next);return result.changed;}

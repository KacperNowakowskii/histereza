import type { State } from '@histereza/shared/types';
import { stageImport } from '../domain/importValidation';
import { event } from './dayService';
import { createPlan } from '../domain/planner';
import { applyState } from './stateTransition';
export function plan(s:State,date:string){applyState(s,createPlan(s,date));return s.routes.filter(r=>r.date===date);}
export function importCsv(s:State,csv:string,orgId:string,commit:boolean) {
  if(!s.online)throw new Error('Nie można importować offline');
  const { result, state }=stageImport(s,csv,orgId);
  if(commit&&result.errors.length===0) {Object.assign(s,state);event(s,'import',orgId,{count:result.deliveries.length});}
  return result;
}

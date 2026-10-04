import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { State } from '@histereza/shared/types';
import { seed } from '../db/seed';
const initialStateSchema=z.custom<State>(value=>{
  if(!value||typeof value!=='object')return false;
  const state=value as Record<string,unknown>;
  return Object.entries(seed()).every(([key,example])=>Array.isArray(example)?Array.isArray(state[key]):typeof state[key]===typeof example);
},'initialState musi zawierać pełny model State');
const schema=z.object({initialState:initialStateSchema.optional(),id:z.string(),name:z.string(),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),startTime:z.string().regex(/^\d{2}:\d{2}$/),deliveriesPerCourier:z.number().int().min(1).max(10),events:z.array(z.object({minute:z.number().int().nonnegative(),kind:z.enum(['delay','traffic','overstay','occupied','break','fuel']),duration:z.number().int().min(1).max(60),courierId:z.string().optional()})),positions:z.record(z.string(),z.object({lat:z.number(),lng:z.number()})).optional()});
export type ScenarioFile=z.infer<typeof schema>;
export function loadScenarioFiles():ScenarioFile[] {
  const directory=fileURLToPath(new URL('../../data/scenarios/',import.meta.url));
  const files=readdirSync(directory).filter(f=>f.endsWith('.json')).sort().map(f=>schema.parse(JSON.parse(readFileSync(`${directory}/${f}`,'utf8'))));
  if(new Set(files.map(f=>f.id)).size!==files.length)throw new Error('Powtórzone ID scenariusza');return files;
}

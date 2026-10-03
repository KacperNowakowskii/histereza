import type { State } from '@histereza/shared/types';
/** Wdraża wynik czystej funkcji, zachowując tożsamość encji w transakcji. */
export function applyState(target:State,next:State) {
  for(const key of Object.keys(next) as (keyof State)[]) {
    const value=next[key],current=target[key];
    if(Array.isArray(value)&&Array.isArray(current)) {
      const entities=new Map(current.filter(x=>x&&typeof x==='object'&&'id' in x).map(x=>[(x as {id:string}).id,x]));
      const result=value.map(x=>{const old=x&&typeof x==='object'&&'id' in x?entities.get((x as {id:string}).id):undefined;return old?Object.assign(old,x):x;});
      (current as unknown[]).splice(0,current.length,...result);
    } else (target as unknown as Record<string,unknown>)[key]=value;
  }
  return target;
}

import type { State } from '@histereza/shared/types';
export function usageReport(s:State){return s.organizations.map(o=>({orgId:o.id,name:o.name,units:s.usage.filter(u=>u.orgId===o.id).reduce((a,u)=>a+u.units,0)}));}

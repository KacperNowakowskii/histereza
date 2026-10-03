import type { State } from '@histereza/shared/types';
import { at } from '../sim/clock';
import { MINUTE } from '@histereza/shared/config';
import { usageReport } from './billing';
export function fairness(s:State) {
  const groups=['small','large'] as const;
  const rows=groups.map(size=>{
    const orgs=s.organizations.filter(o=>o.size===size).map(o=>o.id);const ds=s.deliveries.filter(d=>orgs.includes(d.carrierOrgId));
    const allocated=ds.filter(d=>s.reservations.some(r=>r.deliveryIds.includes(d.id)&&['confirmed','completed'].includes(r.status)));
    const delay=allocated.map(d=>{const r=s.reservations.find(r=>r.deliveryIds.includes(d.id)&&['confirmed','completed'].includes(r.status))!;return Math.max(0,(r.start-at(d.date,'07:00'))/MINUTE);});
    return {size,requested:ds.length,allocated:allocated.length,rate:ds.length?allocated.length/ds.length:0,meanWaitMin:delay.length?Math.round(delay.reduce((a,b)=>a+b,0)/delay.length):0};
  });
  const [small,large]=rows;const warning=small.requested>0&&large.requested>0&&(small.rate+0.1<large.rate||small.meanWaitMin>large.meanWaitMin+15);
  return {rows,warning,message:warning?'Wykryta nierówność dostępu małych firm — wymaga analizy danych':'Brak wykrytej nierówności przy obecnych danych',usage:usageReport(s)};
}

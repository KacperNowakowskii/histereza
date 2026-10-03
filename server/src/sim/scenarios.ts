import type { State } from '@histereza/shared/types';
import { MINUTE } from '@histereza/shared/config';
import { event } from '../services/dayService';
export const scenarios=[{id:'delay',name:'Wyjazd opóźniony o 15 min'},{id:'overstay',name:'Przedłużony rozładunek +20 min'},{id:'occupied',name:'Obcy pojazd na miejscu'},{id:'closure',name:'Zamknięcie ulicy'},{id:'offline',name:'Brak sieci'},{id:'sensor',name:'Awaria czujnika'},{id:'restore',name:'Przywróć sieć i czujniki'}];
export function scenario(s:State,id:string,courierId='courier1',bayId='bay1') {
  const c=s.couriers.find(c=>c.id===courierId)!;const sensor=s.sensors.find(x=>x.bayId===bayId)!;
  if(id==='delay')c.readyAt=Math.max(c.readyAt,s.now)+15*MINUTE;
  else if(id==='overstay') {const st=s.stops.find(st=>st.status==='servicing');if(!st)throw new Error('Najpierw rozpocznij rozładunek kurierem');st.expectedDeparture=(st.expectedDeparture??s.now)+20*MINUTE;}
  else if(id==='occupied') {sensor.occupied=true;sensor.ts=s.now;}
  else if(id==='closure') {
    const group=s.bays.find(b=>b.id===bayId)?.groupId;if(!group)throw new Error('Nieznana ulica');
    for(const bay of s.bays.filter(b=>b.groupId===group))s.rules.push({id:`rule${s.rules.length+1}`,type:'closure',target:bay.id,params:{streetGroup:group},validFrom:s.now,validTo:s.now+120*MINUTE});
  }
  else if(id==='offline')s.online=false;
  else if(id==='sensor')sensor.healthy=false;
  else if(id==='restore') {s.online=true;s.sensors.forEach(x=>{x.healthy=true;x.ts=s.now;});}
  else throw new Error('Nieznany scenariusz');event(s,'scenario','sim',{id,courierId,bayId});
}

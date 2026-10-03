import type { State } from '@histereza/shared/types';
import { at } from '../sim/clock';
export function seed(): State {
  const s: State = { now: at('2026-10-06','17:00'), planningDate: '2026-10-07', online: true, organizations: [], users: [], couriers: [], models: [], vehicles: [], zones: [], bays: [], groups: [], schedules: [], businesses: [], links: [], deliveries: [], routes: [], stops: [], reservations: [], external: [], rules: [], sensors: [], events: [], predictions: [], changes: [], incidents: [], history: [], usage: [], notifications: [], candidateSince: {}, cutoffApplied: false };
  s.organizations = [ {id:'org1',name:'Wisła Logistyka',type:'carrier',size:'large'}, {id:'org2',name:'Kazimierz Dostawy',type:'carrier',size:'small'}, {id:'org3',name:'Kurier Anna',type:'independent',size:'small'}, {id:'org4',name:'Kurier Jan',type:'independent',size:'small'} ];
  for (let i=1;i<=7;i++) {
    const orgId = i<=3?'org1':i<=5?'org2':i===6?'org3':'org4';
    s.users.push({id:`user${i}`,orgId,role:i>=6?'independent':'courier'});
    s.couriers.push({id:`courier${i}`,userId:`user${i}`,orgId,regionIds:['A','B','C'],status:'idle',location:{lat:50.054,lng:19.944},loaded:false,online:true,readyAt:at(s.planningDate,'07:00'),constraints:[]});
  }
  s.models = Array.from({length:6},(_,i) => ({id:`model${i+1}`,lengthM:i===5?9:4.4+i*0.3,widthM:1.8+i*0.04,heightM:2+i*0.1,maxLoadKg:1500,gvwKg:i===4?4500:3500}));
  s.vehicles = Array.from({length:9},(_,i) => ({id:`vehicle${i+1}`,orgId:i<3?'org1':i<5?'org2':i===5?'org3':i===6?'org4':'org1',registrationNumber:`KR DEM${i+1}`,vehicleModelId:`model${i===8?6:i===7?1:i%5+1}`,fuelType:i===6?'electric':'diesel',emissionStandard:i===7?5:6,productionYear:i===7?2012:2020,hasCooling:true,dimensionsVerified:true}));
  s.zones = [{id:'A',name:'Kazimierz',deliveryWindows:[{from:'20:00',to:'09:30'},{from:'13:00',to:'14:00'}],sct:true,speedKmh:18},{id:'B',name:'Stare Miasto',deliveryWindows:[{from:'20:00',to:'09:30'}],sct:true,speedKmh:15},{id:'C',name:'Podzamcze',deliveryWindows:[{from:'23:00',to:'09:30'}],sct:true,speedKmh:18}];
  const names = ['Plac Nowy 1','Plac Nowy 2','Plac Nowy 3','Szewska 1','Szewska 2','Szewska 3','Podzamcze 1','Podzamcze 2'];
  for(let i=0;i<8;i++) {
    const g=i<3?0:i<6?1:2; const bayId=`bay${i+1}`;
    s.bays.push({id:bayId,name:names[i],groupId:`group${g+1}`,zoneId:['A','B','C'][g],lat:[50.0515,50.063,50.055][g]+(i%3)*0.00015,lng:[19.944,19.934,19.936][g],lengthM:6,widthM:2.3,status:'open'});
    s.schedules.push({bayId,day:'*',from:'00:00',to:'00:00',function:'deliveries'});
    s.sensors.push({bayId,ts:s.now,occupied:false,healthy:true});
  }
  s.groups = ['group1','group2','group3'].map(id=>({id,bayIds:s.bays.filter(b=>b.groupId===id).map(b=>b.id)}));
  for(let i=1;i<=25;i++) {
    const group = s.groups[(i-1)%3]; const bay=s.bays.find(b=>b.id===group.bayIds[0])!;
    s.businesses.push({id:`business${i}`,name:`Lokal demonstracyjny ${i}`,entryPoint:{lat:bay.lat+0.00005,lng:bay.lng+0.00005},workingHours:[{from:'07:00',to:'23:59'}],hoursSourceOrgId:i%2?'org1':'org2',unloadingConditions:'Wejście od ulicy; odbiór przy drzwiach',unattendedDropAllowed:false});
    for(const bayId of group.bayIds) s.links.push({businessId:`business${i}`,bayId,walkingM:40,walkingMin:1});
  }
  for(let i=0;i<300;i++) s.history.push({businessId:`business${i%25+1}`,bayId:`bay${i%8+1}`,cargoType:['standard','fresh','cold'][i%3],quantity:1,durationMin:[5,6,7,8,9][i%5],excluded:i%41===0});
  return s;
}
export function sampleCsv(s: State, errors = false) {
  const rows=['externalRef,businessId,date,cargoType,quantity,courierId,vehicleId,mustFollow,opens,closes'];
  for(let i=0;i<45;i++) {
    const c=i%7+1; const b=i%25+1;
    rows.push(`D${i+1},business${b},${s.planningDate},${['standard','fresh','cold'][i%3]},1,${errors&&i===0?'':`courier${c}`},${errors&&i===1?'vehicle9':`vehicle${c}`},,07:00,23:59`);
  }
  if(errors) rows.push(`BAD,business404,${s.planningDate},standard,-1,courier404,vehicle404,,25:00,09:00`);
  return rows.join('\r\n');
}

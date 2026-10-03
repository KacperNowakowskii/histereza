import { fmt, dateFmt } from './components/format';
import { NotificationList } from './components/NotificationList';
import { DispatcherPage } from './pages/dispatcher/DispatcherPage';
import { CourierPage } from './pages/courier/CourierPage';
import { BusinessPage } from './pages/business/BusinessPage';
import { PublicPage } from './pages/public/PublicPage';
import { OperationsPage } from './pages/operator/OperationsPage';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { State, Role, Stop } from '@histereza/shared/types';
import { CONFIG, MINUTE } from '@histereza/shared/config';
import { REASONS } from '@histereza/shared/reasons';
import { MapView } from './components/MapView';
type Data=State & {bayScreens:Record<string,{status:string;until?:number;qrUntil:number}>} & {vehicleOptions:(State['vehicles'][number]&{reason?:string;sctStatus:string})[];scenarios:{id:string;name:string}[]};
export const statusNames:Record<string,string>={idle:'Przed wyjazdem',gate:'Brama decyzyjna',driving:'W drodze',servicing:'Rozładunek',finished:'Zakończono',pending:'Zaplanowano',done:'Zakończono',waiting:'Oczekiwanie',confirmed:'Potwierdzona',completed:'Zakończona',suspended:'Zawieszona','no-show':'Nieobecność',cancelled:'Anulowana',planned:'Zaplanowano',imported:'Zaimportowano',delivered:'Doręczono',closed:'Lokal zamknięty'};
const roles:{id:Role;title:string;desc:string;icon:string}[]=[{id:'dispatcher',title:'Firma kurierska',desc:'Import, plan załadunku i podgląd dostaw',icon:'▤'},{id:'courier',title:'Kurier firmowy',desc:'Jedna decyzja. Jeden kolejny cel.',icon:'↗'},{id:'independent',title:'Kurier samodzielny',desc:'Własne dostawy we wspólnym planie',icon:'◇'},{id:'business',title:'Punkt odbioru',desc:'Godziny przyjazdu i powiadomienia',icon:'⌂'},{id:'public',title:'Kierowca · QR',desc:'Krótki postój pomiędzy dostawami',icon:'▦'},{id:'operator',title:'Operator miasta',desc:'Incydenty, zamknięcia i równość dostępu',icon:'◎'},{id:'sim',title:'Symulator',desc:'Scenariusze, GPS, czujniki i zegar',icon:'▷'}];
function useAppController(){
  const [s,setS]=useState<Data>();const [role,setRole]=useState<Role>(()=>(localStorage.getItem('role') as Role)||'dispatcher');
  const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const [orgId,setOrgId]=useState('org1');const [courierId,setCourierId]=useState('courier1');const [businessId,setBusinessId]=useState('business1');const [bayId,setBayId]=useState('bay1');
  const [csv,setCsv]=useState('');const [validation,setValidation]=useState<{errors:{row:number;message:string}[];deliveries:unknown[]}>();const [validatedCsv,setValidatedCsv]=useState('');const [vehicleId,setVehicleId]=useState('');const [reason,setReason]=useState('blocked');const [plate,setPlate]=useState('');const [parkingId,setParkingId]=useState(()=>sessionStorage.getItem('parkingId')??'');
  const [reports,setReports]=useState<any>();const location=useLocation();const navigate=useNavigate();
  const refresh=async()=>{const response=await fetch('/api/reference');if(!response.ok)throw new Error('Nie można pobrać danych');setS(await response.json());};
  useEffect(()=>{let active=true;const poll=async()=>{try{const r=await fetch('/api/reference');if(!r.ok)throw new Error('Backend niedostępny');const d=await r.json();if(active)setS(d);}catch(e){if(active)setError(String(e));}};void poll();const interval=setInterval(poll,2000);return()=>{active=false;clearInterval(interval);};},[]);
  const choose=(r:Role)=>{setRole(r);localStorage.setItem('role',r);setError('');setMessage('');navigate(`/${r}`);};
  useEffect(()=>{
    const segment=location.pathname.split('/')[1];const next=segment==='qr'||segment==='bay'?'public':roles.find(r=>r.id===segment)?.id;
    if(next){setRole(next);localStorage.setItem('role',next);}
    if(next==='independent'){setOrgId(v=>['org3','org4'].includes(v)?v:'org3');setCourierId(v=>['courier6','courier7'].includes(v)?v:'courier6');}
    if(next==='dispatcher'||next==='courier'){setOrgId(v=>['org1','org2'].includes(v)?v:'org1');setCourierId(v=>['courier6','courier7'].includes(v)?'courier1':v);}
  },[location.pathname]);
  const request=async(path:string,body?:unknown,method='POST')=>{setBusy(true);setError('');setMessage('');try{const r=await fetch(`/api${path}`,{method,headers:{'Content-Type':'application/json','x-role':role},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error??'Błąd');await refresh();setMessage('Zapisano. System zaktualizował dane.');return data;}catch(e){setError(e instanceof Error?e.message:String(e));return undefined;}finally{setBusy(false);}};
  if(!s)return {error,ctx:undefined};
  const c=s.couriers.find(c=>c.id===courierId)!;const route=s.routes.find(r=>r.courierId===courierId&&r.date===s.planningDate);const stop=s.stops.find(st=>st.id===c?.targetStopId);const bay=s.bays.find(b=>b.id===stop?.bayId);
  const path=location.pathname;const publicBay=path.startsWith('/qr/')||path.startsWith('/bay/')?decodeURIComponent(path.split('/')[2]):bayId;const pb=s.bays.find(b=>b.id===publicBay);const nextRes=s.reservations.filter(r=>r.bayId===publicBay&&r.status==='confirmed'&&r.end>s.now).sort((a,b)=>a.start-b.start)[0];const screen=s.bayScreens[publicBay];const until=screen?.qrUntil??s.now;
  const action=(a:string,extra:object={})=>request(`/courier/${courierId}/action`,{action:a,...extra});
  const table=(stops:Stop[])=><div className="table-wrap"><table><thead><tr><th>Kurier / kolejność</th><th>Punkt i miejsce</th><th>Slot</th><th>Dostawy</th><th>Status</th></tr></thead><tbody>{stops.map(st=>{const r=s.routes.find(r=>r.id===st.routeId)!;const reservation=s.reservations.find(r=>r.stopId===st.id);return <tr key={st.id}><td><strong>{r.courierId}</strong><small>Postój {st.sequence+1}{st.frozen?' · cel zamrożony':''}</small></td><td>{s.bays.find(b=>b.id===st.bayId)?.name}<small>{st.deliveryIds.map(id=>s.businesses.find(b=>b.id===s.deliveries.find(d=>d.id===id)?.businessId)?.name).join(', ')}</small></td><td>{fmt(reservation?.start)}–{fmt(reservation?.end)}<small>{st.plannedServiceMin} min · {reservation?.status&&statusNames[reservation.status]}</small></td><td>{st.deliveryIds.length}</td><td><span className={`badge ${st.status}`}>{statusNames[st.status]}</span></td></tr>})}</tbody></table>{!stops.length&&<p className="empty">Brak planu. Zaimportuj dostawy, a następnie uruchom wspólną alokację przy cut-off.</p>}</div>;
  return {error,ctx:{s,role,error,message,busy,orgId,courierId,businessId,bayId,csv,validation,validatedCsv,vehicleId,reason,plate,parkingId,reports,location,navigate,choose,request,c,route,stop,bay,path,publicBay,pb,nextRes,until,screen,action,table,setError,setMessage,setOrgId,setCourierId,setBusinessId,setBayId,setCsv,setValidation,setValidatedCsv,setVehicleId,setReason,setPlate,setParkingId,setReports}};
}
export type AppContext=NonNullable<ReturnType<typeof useAppController>['ctx']>;
export function App(){const model=useAppController();const ctx=model.ctx;if(!ctx)return <main className="loading"><h1>Histereza</h1><p>{model.error||'Łączenie z lokalnym systemem…'}</p></main>;const {s,role,error,message,busy,orgId,courierId,businessId,bayId,csv,validation,validatedCsv,vehicleId,reason,plate,parkingId,reports,location,navigate,choose,request,c,route,stop,bay,path,publicBay,pb,nextRes,until,screen,action,table,setError,setMessage,setOrgId,setCourierId,setBusinessId,setBayId,setCsv,setValidation,setValidatedCsv,setVehicleId,setReason,setPlate,setParkingId,setReports}=ctx;
  return <div className="shell"><aside><Link className="brand" to="/">histereza<span>KOORDYNACJA MIEJSKA</span></Link><div className="city">KRAKÓW <span>DEMO LOKALNE</span></div><nav><Link to="/">Wybierz rolę</Link>{roles.map(r=><button key={r.id} className={role===r.id&&path!=='/'?'active':''} onClick={()=>choose(r.id)}><span>{r.icon}</span>{r.title}</button>)}</nav><div className="aside-foot">Wspólna przestrzeń.<br/>Równe prawa.<small>Brak premium i płatnego pierwszeństwa.</small></div></aside><div className="content"><header><div><span className="eyebrow">MIEJSKI SYSTEM DOSTAW</span><strong>{roles.find(r=>r.id===role)?.title}</strong></div><div className="clock"><span className={`dot ${s.online?'':'offline'}`}/>{dateFmt(s.now)} <b>{fmt(s.now)}</b><span className="badge">Czas symulacji</span></div></header><main>
    {error&&<div className="alert error" role="alert">{error}<button onClick={()=>setError('')}>×</button></div>}{message&&<div className="alert success" role="status">{message}</div>}
    {path==='/'?<><div className="hero"><span className="eyebrow">MNIEJ KONFLIKTÓW. WIĘCEJ MIEJSCA.</span><h1>Dostawy w rytmie miasta.</h1><p>Wspólny plan tras i miejsc postojowych dla historycznego centrum Krakowa. System planuje i naprawia; Ty realizujesz dostawy.</p><div className="hero-line">8 miejsc <span>·</span> 3 strefy <span>·</span> 7 kurierów</div></div><div className="role-grid">{roles.map(r=><button className="role-card" key={r.id} onClick={()=>choose(r.id)}><span className="role-icon">{r.icon}</span><h2>{r.title}</h2><p>{r.desc}</p><span className="arrow">Otwórz panel ↗</span></button>)}</div></>:
    <><div className="page-heading"><div><span className="eyebrow">{s.planningDate} · CENTRUM KRAKOWA</span><h1>{path.startsWith('/bay/')?'Ekran miejsca':roles.find(r=>r.id===role)?.title}</h1></div><span className="badge">Polling co 2 s</span></div>
    {role==='independent'&&<div className="actions"><Link className="button secondary" to="/independent">Moje dostawy</Link><Link className="button secondary" to="/independent/next">Ekran kuriera</Link></div>}
    <DispatcherPage ctx={ctx}/>
    <CourierPage ctx={ctx}/>
    <BusinessPage ctx={ctx}/>
    <PublicPage ctx={ctx}/>
    <OperationsPage ctx={ctx}/>

    </>}
  </main><footer>Histereza / Kraków <span>Dane fikcyjne · GPS, czujniki i ruch symulowane</span></footer></div></div>;
}

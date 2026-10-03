import { Link } from 'react-router-dom';
import type { AppContext } from '../../App';
import { CONFIG, MINUTE } from '@histereza/shared/config';
import { REASONS } from '@histereza/shared/reasons';
import { MapView } from '../../components/MapView';
import { NotificationList } from '../../components/NotificationList';
import { fmt } from '../../components/format';
export function BusinessPage({ctx}:{ctx:AppContext}){const {s,role,error,message,busy,orgId,courierId,businessId,bayId,csv,validation,validatedCsv,vehicleId,reason,plate,parkingId,reports,location,navigate,choose,request,c,route,stop,bay,path,publicBay,pb,nextRes,until,screen,action,table,setError,setMessage,setOrgId,setCourierId,setBusinessId,setBayId,setCsv,setValidation,setValidatedCsv,setVehicleId,setReason,setPlate,setParkingId,setReports}=ctx;return <>
    {role==='business'&&<><div className="panel"><div className="panel-title"><h2>Zapowiedziane dostawy</h2><select value={businessId} onChange={e=>setBusinessId(e.target.value)}>{s.businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><p>Godziny pracy: {s.businesses.find(b=>b.id===businessId)?.workingHours.map(w=>`${w.from}–${w.to}`).join(', ')}. Dane podane przez firmę kurierską.</p><p>Ten panel służy wyłącznie do podglądu. Dostawy i dyspozycje wprowadza firma kurierska.</p>{table(s.stops.filter(st=>st.deliveryIds.some(id=>s.deliveries.find(d=>d.id===id)?.businessId===businessId)))}<NotificationList s={s} userId={businessId}/></div></>}

</>; }

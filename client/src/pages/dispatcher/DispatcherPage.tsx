import { useEffect, useRef, useState } from 'react';
import { RouteLoading } from '../../components/RouteLoading';
import type { AppContext } from '../../App';
import { CONFIG } from '@histereza/shared/config';
import { declarationsClosed, deliveryDays, systemDay } from '@histereza/shared/deliveryDates';
import { MapView } from '../../components/MapView';
import { DeliveryWorkspace } from './DeliveryWorkspace';
export function DispatcherPage({ ctx }: { ctx: AppContext }) {
  const { s, orgId, setOrgId, table } = ctx;
  const today = systemDay(s.now), days = deliveryDays(s.now);
  const [selectedDate, setSelectedDate] = useState(today); const previousDay = useRef(today);
  useEffect(() => {
    const old = previousDay.current; previousDay.current = today;
    setSelectedDate(date => date === old || !days.some(d => d.date === date) ? today : date);
  }, [today]);
  if (ctx.role !== 'dispatcher') return null;
  const routes = s.routes.filter(r => r.date === selectedDate && s.couriers.find(c => c.id === r.courierId)?.orgId === orgId);
  const closed = declarationsClosed(s.now, selectedDate, s.closedDeliveryDates);
  return <>
    <div className="panel catalog-company"><label>Firma kurierska<select aria-label="Firma kurierska" value={orgId} onChange={e => { setOrgId(e.target.value); ctx.setError(''); ctx.setMessage(''); }}>{s.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label></div>
    <div className="panel"><h2>Dostawy według dni</h2><nav className="delivery-days" aria-label="Dni dostaw">{days.map(({ date, offset }) => <button key={date} type="button" aria-pressed={selectedDate === date} className={selectedDate === date ? '' : 'secondary'} onClick={() => setSelectedDate(date)}><strong>{offset === 0 ? 'Dzisiaj' : offset < 0 ? -offset + (offset === -1 ? ' dzień temu' : ' dni temu') : 'Za ' + offset + (offset === 1 ? ' dzień' : ' dni')}</strong><span>{date}</span><small>{s.deliveries.filter(d => d.carrierOrgId === orgId && d.date === date).length} dostaw · {offset <= 0 ? 'podgląd' : 'deklaracje'}</small></button>)}</nav></div>
    <DeliveryWorkspace key={orgId+':'+selectedDate} ctx={ctx} selectedDate={selectedDate} />
    <div className="panel"><h2>{closed ? 'Zatwierdzony plan · '+selectedDate : 'Deklaracje · '+selectedDate}</h2>{closed ? <><p>Lista została zamknięta automatycznie o 00:00. Wspólne sloty z buforem {CONFIG.BUFFER_MIN} min.</p>{table(s.stops.filter(st => routes.some(r => r.id === st.routeId)))}{routes.map(r => <RouteLoading key={r.id} route={r} s={s} />)}</> : <p>Ostateczne trasy powstaną automatycznie o 00:00 rozpoczynającym {selectedDate}. Do tego czasu możesz deklarować, edytować i usuwać dostawy.</p>}</div>
    <MapView s={s} />
  </>;
}

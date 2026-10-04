import { mapColors } from '../../components/brandColors';
import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import type { Courier, Route, State } from '@histereza/shared/types';
import { fmt } from '../../components/format';
import { navigationUrl, routeView } from './routeView';
import './courier.css';
function FitRoute({ coordinates }: { coordinates: [number,number][] }) {
  const map = useMap(), key = JSON.stringify(coordinates);
  useEffect(() => { map.invalidateSize(); map.fitBounds(coordinates, { padding: [30,30], maxZoom: 16 }); }, [map,key]);
  return null;
}
export function UnloadingTimer({ seconds }: { seconds: number }) {
  return <div className={`unloading-countdown ${seconds === 0 ? 'expired' : ''}`} role="timer" aria-label="Pozostały czas rozładunku"><small>Pozostały czas rozładunku</small><strong>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong>{seconds === 0 && <span>Planowany czas rozładunku minął</span>}</div>;
}
export function CourierRoute({ s, courier, route }: { s: State; courier: Courier; route: Route }) {
  const view = routeView(s,courier,route);
  const points = view.stops.flatMap(stop => { const bay = s.bays.find(b => b.id === stop.bayId); return bay ? [{ stop, bay }] : []; });
  const coordinates: [number,number][] = points.map(p => [p.bay.lat,p.bay.lng]);
  const position: [number,number] = [courier.location.lat,courier.location.lng];
  const nextBay = points.find(p => p.stop.id === view.next?.id)?.bay;
  const state = (id: string, done: boolean) => done ? 'done' : id === view.current?.id ? 'current' : id === view.next?.id ? 'next' : 'later';
  const colors = { done: mapColors.muted, current: mapColors.accent, next: mapColors.primary, later: mapColors.muted };
  return <div className="panel courier-route-panel"><div className="panel-title"><h2>Podgląd Twojej trasy</h2><span>{view.completed} / {view.stops.length} punktów zakończonych</span></div>
    <div className="courier-route-grid"><div><div className="courier-route-map" aria-label="Mapa własnej trasy"><MapContainer center={position} zoom={15} className="map" scrollWheelZoom={false}><TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitRoute coordinates={[position,...coordinates]} />
      {coordinates.length > 1 && <Polyline positions={coordinates} pathOptions={{ color: mapColors.primary, weight: 4, opacity: .65 }} />}
      {points.map(({ stop, bay }) => { const kind = state(stop.id,stop.status==='done'); return <CircleMarker key={stop.id} center={[bay.lat,bay.lng]} radius={kind==='current'?13:kind==='next'?10:7} pathOptions={{ color: colors[kind], fillOpacity: kind==='done'?.25:.85, weight: kind==='current'?4:2, dashArray: kind==='next'?'4 3':undefined }}><Popup><strong>{stop.sequence+1}. {bay.name}</strong><br />{kind==='current'?'Aktualny punkt':kind==='next'?'Kolejny punkt':kind==='done'?'Zakończony':'Późniejszy punkt'}<br />{fmt(stop.plannedArrival)} · {stop.plannedServiceMin} min rozładunku</Popup></CircleMarker>; })}
      <CircleMarker center={position} radius={6} pathOptions={{ color: mapColors.surface, fillColor: mapColors.primary, fillOpacity: 1, weight: 3 }}><Popup>Twoja aktualna pozycja · {courier.id}</Popup></CircleMarker>
    </MapContainer></div><p className="route-legend"><span>● Aktualny</span><span>● Kolejny</span><span>● Zakończony</span></p>{nextBay && <a className="button route-navigation" href={navigationUrl(nextBay.lat,nextBay.lng)} target="_blank" rel="noopener noreferrer">Nawiguj do kolejnego punktu w Google Maps</a>}<p className="hint">Linia pokazuje kolejność punktów. Nawigację drogową otworzysz w Google Maps.</p></div>
    <div className="route-timeline"><h3>Punkty Twojej trasy</h3><div role="progressbar" aria-label="Postęp trasy" aria-valuemin={0} aria-valuemax={view.stops.length || 1} aria-valuenow={view.completed} aria-valuetext={`${view.completed} z ${view.stops.length} punktów zakończonych`} className="route-progress"><span style={{ height: `${view.stops.length ? view.completed/view.stops.length*100 : 0}%` }} /></div>
      <ol>{view.stops.map(stop => { const kind = state(stop.id,stop.status==='done'), bay = s.bays.find(b=>b.id===stop.bayId); return <li key={stop.id} className={`route-point ${kind}`} aria-current={kind==='current'?'step':undefined} data-stop-id={stop.id}><span className="route-point-number">{stop.status==='done'?'✓':stop.sequence+1}</span><div><small>{kind==='done'?'Zakończony':kind==='current'?'Aktualny punkt':kind==='next'?'Kolejny punkt':'Późniejszy punkt'}</small><strong>{bay?.name ?? 'Oczekiwanie na miejsce'}</strong><p>{stop.deliveryIds.map(id=>s.deliveries.find(d=>d.id===id)?.businessName).filter(Boolean).join(' · ')}</p><span>Planowany przyjazd: {fmt(stop.plannedArrival)}</span><span>Rozładunek: {stop.plannedServiceMin} min</span>{kind==='current' && view.remainingSeconds !== undefined && <UnloadingTimer seconds={view.remainingSeconds} />}</div></li>; })}</ol>{!view.stops.length && <p>Brak punktów na tej trasie.</p>}
    </div></div></div>;
}

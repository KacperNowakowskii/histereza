import { NavLink } from 'react-router-dom';
import type { AppContext } from '../../App';
import { DispatcherPage } from './DispatcherPage';
import { BusinessesPage } from './BusinessesPage';
import { FleetPage } from './FleetPage';
export function DispatcherPanel({ ctx }: { ctx: AppContext }) {
  if (ctx.role !== 'dispatcher') return null;
  const businesses = ctx.path === '/dispatcher/businesses'; const fleet = ctx.path === '/dispatcher/fleet';
  return <><div className="catalog-nav" aria-label="Zakładki firmy"><NavLink end to="/dispatcher">Dostawy</NavLink><NavLink to="/dispatcher/businesses">Biznesy</NavLink><NavLink to="/dispatcher/fleet">Flota</NavLink></div>{(businesses || fleet) && <div className="panel catalog-company"><label>Firma kurierska<select aria-label="Firma kurierska" value={ctx.orgId} onChange={e => { ctx.setOrgId(e.target.value); ctx.setError(''); ctx.setMessage(''); }}>{ctx.s.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label></div>}{businesses ? <BusinessesPage key={ctx.orgId} ctx={ctx} /> : fleet ? <FleetPage key={ctx.orgId} ctx={ctx} /> : <DispatcherPage ctx={ctx} />}</>;
}

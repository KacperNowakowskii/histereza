import type { State } from '@histereza/shared/types';
import { systemDay } from '@histereza/shared/deliveryDates';
import { at } from '../sim/clock';
import { plan } from './planningService';
import { event } from './dayService';

/** Jedynym źródłem czasu jest s.now; każda data zamykana jest raz. */
export function closeDueDeliveryDays(s: State) {
  const today = systemDay(s.now);
  if (s.planningDate !== today) {
    s.planningDate = today;
    for (const c of s.couriers) { c.status = 'idle'; c.loaded = false; delete c.targetStopId; delete c.pause; c.readyAt = at(today, '07:00'); }
  }
  const dates = [...new Set([today, ...s.deliveries.map(d => d.date), ...s.routes.map(r => r.date)])].filter(date => date <= today).sort();
  for (const date of dates) {
    if (s.closedDeliveryDates.includes(date)) continue;
    if (s.deliveries.some(d => d.date === date && d.status === 'imported') && !s.routes.some(r => r.date === date)) plan(s, date);
    s.closedDeliveryDates.push(date);
    event(s, 'delivery-day-closed', 'system', { date, deadline: at(date, '00:00'), routes: s.routes.filter(r => r.date === date).map(r => r.id) });
  }
}

import type { Route, State } from '@histereza/shared/types';
import { loadingGroups } from '@histereza/shared/priorities';
export function RouteLoading({ route, s }: { route: Route; s: State }) {
  const fallback = loadingGroups(s.deliveries.filter(d => route.loadingList.includes(d.id)));
  const mode = route.loadingMode ?? fallback.mode; const groups = route.loadingGroups ?? fallback.groups;
  const list = (ids: string[]) => <ul>{ids.map(id => { const d = s.deliveries.find(d => d.id === id); return <li key={id}>{d?.externalRef} — {d?.businessName}</li>; })}</ul>;
  return <details><summary>Lista załadunku · {route.courierId}</summary>{mode === 'free' ? <><p>Swobodny dostęp: jedna grupa lub brak priorytetów. Kolejność ułożenia paczek jest dowolna.</p>{list(route.loadingList)}</> : <><p>Ładuj grupy w podanej kolejności. Priorytet 1 ładuje się ostatni. W obrębie każdej grupy ułożenie paczek jest dowolne.</p>{groups.map((group, i) => <div key={group.priority}><strong>Ładowanie {i + 1}: {group.priority ? `priorytet ${group.priority}` : 'bez priorytetu'}</strong>{list(group.deliveryIds)}</div>)}</>}</details>;
}

import type { Delivery } from './types';
export type PriorityDelivery = Pick<Delivery, 'id' | 'carrierOrgId' | 'courierId' | 'vehicleId' | 'date' | 'priority'>;
export const priorityScope = (d: PriorityDelivery) => JSON.stringify([d.carrierOrgId, d.courierId, d.vehicleId, d.date]);
export const priorityRank = (d: Pick<Delivery, 'priority'>) => d.priority > 0 ? d.priority : Infinity;
export const priorityLevels = (ds: Pick<Delivery, 'priority'>[]) => [...new Set(ds.filter(d => d.priority > 0).map(d => d.priority))].sort((a, b) => a - b);
export function priorityIssues(ds: PriorityDelivery[]) {
  const scopes = new Map<string, PriorityDelivery[]>();
  for (const d of ds) { const key = priorityScope(d); const group = scopes.get(key) ?? []; group.push(d); scopes.set(key, group); }
  const issues: { deliveryId: string; message: string }[] = [];
  for (const group of scopes.values()) {
    const levels = priorityLevels(group); const index = levels.findIndex((level, i) => level !== i + 1);
    if (index < 0) continue;
    const missing = index + 1;
    for (const d of group.filter(d => d.priority > missing)) issues.push({ deliveryId: d.id, message: `Brakuje priorytetu ${missing} dla kuriera ${d.courierId}, pojazdu ${d.vehicleId} i daty ${d.date}. Grupy muszą tworzyć ciąg 1 → 2 → 3 → …` });
  }
  return issues;
}
export function assertPriorities(ds: PriorityDelivery[]) { const issue = priorityIssues(ds)[0]; if (issue) throw new Error(issue.message); }
export function priorityChoices(others: PriorityDelivery[], draft: PriorityDelivery) {
  const levels = priorityLevels(others.filter(d => priorityScope(d) === priorityScope(draft)));
  const values = [...new Set([0, 1, ...levels, (levels.at(-1) ?? 0) + 1, draft.priority])].sort((a, b) => a - b);
  return values.map(value => ({ value, disabled: priorityIssues([...others, { ...draft, priority: value }]).length > 0 }));
}
/** Bez grup numerowanych nie narzucamy żadnego ułożenia towarów. */
export function loadingGroups(ds: Delivery[]) {
  const ranks = [...new Set(ds.map(priorityRank))].sort((a, b) => b - a);
  const grouped = ranks.length > 1 && priorityLevels(ds).length > 0;
  return { mode: grouped ? 'grouped' as const : 'free' as const, groups: grouped ? ranks.map(rank => ({ priority: rank === Infinity ? 0 : rank, deliveryIds: ds.filter(d => priorityRank(d) === rank).map(d => d.id) })) : [{ priority: ds[0]?.priority ?? 0, deliveryIds: ds.map(d => d.id) }] };
}

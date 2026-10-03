import type { State } from '@histereza/shared/types';
import { fmt } from './format';
export function NotificationList({s,userId}:{s:State;userId:string}){const items=s.notifications.filter(n=>n.userId===userId).slice(-10).reverse();return <div className="notifications"><h3>Powiadomienia</h3>{items.length?items.map(n=><p key={n.id}><small>{fmt(n.ts)}</small> {n.text}</p>):<p className="empty">Brak nowych powiadomień.</p>}</div>;}

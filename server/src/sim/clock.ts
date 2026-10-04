import { MINUTE } from '@histereza/shared/config';
const offsetFormatter = new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Warsaw',timeZoneName:'longOffset'});
const dayFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' });
export const at = (date: string, time: string) => {
  const candidate=Date.parse(`${date}T${time}:00Z`);if(!Number.isFinite(candidate))return NaN;
  const offset=offsetFormatter.formatToParts(candidate).find(p=>p.type==='timeZoneName')!.value.replace('GMT','');
  return Date.parse(`${date}T${time}:00${offset||'Z'}`);
};
export const day = (ts: number) => dayFormatter.format(ts);
export const time = (ts: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hour12: false }).format(ts);
export const advance = (now: number, minutes: number) => now + minutes * MINUTE;

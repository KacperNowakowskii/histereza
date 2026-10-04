const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' });
export const systemDay = (now: number) => formatter.format(now);
export function shiftDay(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10);
}
export const dayDistance = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
export const deliveryDays = (now: number) => [-2, -1, 0, 1, 2, 3].map(offset => ({ date: shiftDay(systemDay(now), offset), offset }));
export const declarationsClosed = (now: number, date: string, closed: string[] = []) => date <= systemDay(now) || closed.includes(date);
export const declarationDeadlineMessage = (date: string) => `Termin deklaracji dostaw na dzień ${date} już minął. Lista została zamknięta o 00:00 rozpoczynającym ten dzień.`;

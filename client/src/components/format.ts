export const fmt=(ts?:number)=>ts?new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit'}).format(ts):'—';
export const dateFmt=(ts:number)=>new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw',day:'numeric',month:'long',year:'numeric'}).format(ts);

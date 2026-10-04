import { useState } from 'react';
import type { AppContext } from '../../App';
import { MINUTE } from '@histereza/shared/config';
export function CourierProblems({ctx}:{ctx:AppContext}) {
  const {s,c,stop,busy,action}=ctx;
  const [problem,setProblem]=useState(false), [cause,setCause]=useState('occupied');
  const [kind,setKind]=useState<'break'|'fuel'>(), [minutes,setMinutes]=useState(10);
  if(!ctx.route) return null;
  const p=c.pause;
  return <div className="courier-problems">
    {p ? <div className="slot-card" role="status"><div><strong>{p.kind==='fuel'?'Tankowanie':'Przerwa'} · {p.minutes} min</strong><p>{p.phase==='planned'?'Zaplanowana po zakończeniu aktualnego punktu. Dostawa pozostaje do wykonania.':p.phase==='active'?'Trwa — jesteś czasowo niedostępny. Zakończ przerwę, aby rozpocząć 5-minutowy bufor.':`Bufor powrotu: ${Math.max(0,Math.ceil(((p.resumeAt ?? s.now)-s.now)/MINUTE))} min. Kolejny cel otrzymasz po jego upływie.`}</p>{p.phase==='active'&&<button disabled={busy} onClick={()=>action('finish-break')}>Skończ przerwę</button>}</div></div> : stop && ['gate','driving','servicing'].includes(c.status) && <><p>Przerwę lub tankowanie planujesz z wyprzedzeniem, po zakończeniu tego punktu. Po zakończeniu przerwy obowiązuje 5-minutowy bufor.</p><div className="catalog-row-actions"><button className="secondary" disabled={busy} onClick={()=>setKind('break')}>Dodaj przerwę</button><button className="secondary" disabled={busy} onClick={()=>setKind('fuel')}>Dodaj tankowanie</button></div>{kind&&<div><label>Przewidywany czas<select aria-label="Przewidywany czas przerwy" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[5,10,15,20,30].map(n=><option key={n} value={n}>{n} min</option>)}</select></label><button disabled={busy} onClick={async()=>{if(await action(kind==='fuel'?'plan-fuel':'plan-break',{minutes}))setKind(undefined);}}>Zaplanuj {kind==='fuel'?'tankowanie':'przerwę'} po tym punkcie</button><button className="secondary" onClick={()=>setKind(undefined)}>Anuluj wybór</button></div>}</>}
    {c.status==='servicing'&&stop&&<><button className="secondary" disabled={busy} onClick={()=>setProblem(v=>!v)}>Zgłoś problem</button>{problem&&<div><label>Przyczyna problemu<select aria-label="Przyczyna problemu" value={cause} onChange={e=>setCause(e.target.value)}><option value="occupied">Miejsce zajęte</option><option value="extended-unloading">Przedłużony rozładunek</option></select></label><p>Zgłoszenie zwiększa przewidywany czas obsługi o 10 minut i uruchamia analizę przyszłych konfliktów.</p><button disabled={busy} onClick={async()=>{if(await action('problem',{reason:cause}))setProblem(false);}}>Wyślij zgłoszenie</button></div>}</>}
  </div>;
}

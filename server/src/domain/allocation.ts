/** Każdy uczestnik dostaje jeden wniosek w turze; kolejność zgłoszenia i płatność nie są wejściem. */
export function fairOrder<T>(queues:ReadonlyArray<ReadonlyArray<T>>):T[] {
  const work=queues.map(q=>[...q]);const out:T[]=[];
  while(work.some(q=>q.length))for(const queue of work){const item=queue.shift();if(item!==undefined)out.push(item);}
  return out;
}

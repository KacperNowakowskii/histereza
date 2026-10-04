import { useState } from 'react';
import type { Business } from '@histereza/shared/types';
import { businessMatches, normalizeName } from '@histereza/shared/catalog';
/** Wspólny selektor dla katalogu i przyszłych formularzy dostawy. */
export function BusinessPicker({ businesses, onSelect }: { businesses: Business[]; onSelect: (business: Business) => void }) {
  const [id, setId] = useState(''); const [name, setName] = useState('');
  const select = (b: Business) => { setId(b.id); setName(b.name); onSelect(b); };
  const search = (value: string, field: 'id' | 'name') => {
    if (field === 'id') { setId(value); setName(''); } else { setName(value); setId(''); }
    if (value.trim()) { const matches = businessMatches(businesses, { [field]: value }); if (matches.length === 1) select(matches[0]); }
  };
  const matches = businesses.filter(b => (!id || normalizeName(b.id).includes(normalizeName(id))) && (!name || normalizeName(b.name).includes(normalizeName(name))));
  return <div className="catalog-lookup"><div className="catalog-fields"><label>Wyszukaj po ID<input value={id} onChange={e => search(e.target.value, 'id')} placeholder="ID biznesu" /></label><label>Wyszukaj po nazwie<input value={name} onChange={e => search(e.target.value, 'name')} placeholder="Nazwa biznesu" /></label></div>{(id || name) && <div className="catalog-matches">{matches.length ? matches.slice(0, 10).map(b => <button type="button" className="secondary" key={b.id} onClick={() => select(b)}>{b.id} · {b.name}</button>) : <p>Brak biznesu o podanym ID lub nazwie.</p>}{matches.length > 1 && <small>Wybierz rekord, aby uzupełnić wszystkie dane.</small>}</div>}</div>;
}

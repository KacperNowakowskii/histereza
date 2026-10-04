import type { State } from '@histereza/shared/types';
import type { DeliveryInput } from '@histereza/shared/deliveryInput';
export type NewBusiness = NonNullable<DeliveryInput['newBusiness']>;
export type NewVehicle = NonNullable<DeliveryInput['newVehicle']>;
export function InlineBusinessFields({ s, value: b, onChange }: { s: State; value: NewBusiness; onChange: (b: NewBusiness) => void }) {
  return <fieldset><legend>Nowy biznes — zostanie zapisany w bazie Biznesy</legend><div className="catalog-fields">
    <label>ID nowego biznesu (opcjonalnie)<input value={b.id ?? ''} maxLength={100} onChange={e => onChange({ ...b, id: e.target.value || undefined })} placeholder="System nada ID, jeśli pozostawisz puste" /></label>
    <label>Nazwa nowego biznesu<input required value={b.name} maxLength={200} onChange={e => onChange({ ...b, name: e.target.value })} /></label>
    <label>Szerokość geograficzna<input required type="number" step="any" min={-90} max={90} value={b.entryPoint.lat} onChange={e => onChange({ ...b, entryPoint: { ...b.entryPoint, lat: Number(e.target.value) } })} /></label>
    <label>Długość geograficzna<input required type="number" step="any" min={-180} max={180} value={b.entryPoint.lng} onChange={e => onChange({ ...b, entryPoint: { ...b.entryPoint, lng: Number(e.target.value) } })} /></label>
  </div>{b.workingHours.map((w, i) => <div className="catalog-window" key={i}><label>Godzina otwarcia<input required type="time" value={w.from} onChange={e => onChange({ ...b, workingHours: b.workingHours.map((w, j) => j === i ? { ...w, from: e.target.value } : w) })} /></label><label>Godzina zamknięcia<input required type="time" value={w.to} onChange={e => onChange({ ...b, workingHours: b.workingHours.map((w, j) => j === i ? { ...w, to: e.target.value } : w) })} /></label><button type="button" className="secondary" disabled={b.workingHours.length === 1} onClick={() => onChange({ ...b, workingHours: b.workingHours.filter((_, j) => j !== i) })}>Usuń okno</button></div>)}
    <button type="button" className="secondary" disabled={b.workingHours.length >= 8} onClick={() => onChange({ ...b, workingHours: [...b.workingHours, { from: '13:00', to: '14:00' }] })}>Dodaj okno godzinowe</button>
    <p>Miejsca obsługujące biznes — wybierz co najmniej jedno</p><div className="catalog-checks">{s.bays.map(bay => <label key={bay.id}><input type="checkbox" checked={b.bayIds.includes(bay.id)} onChange={e => onChange({ ...b, bayIds: e.target.checked ? [...b.bayIds, bay.id] : b.bayIds.filter(id => id !== bay.id) })} />{bay.name}</label>)}</div>
    <label>Warunki rozładunku<textarea value={b.unloadingConditions} maxLength={1000} onChange={e => onChange({ ...b, unloadingConditions: e.target.value })} /></label><label className="catalog-check"><input type="checkbox" checked={b.unattendedDropAllowed} onChange={e => onChange({ ...b, unattendedDropAllowed: e.target.checked })} />Dozwolone pozostawienie towaru</label>
  </fieldset>;
}
export function InlineVehicleFields({ s, value: v, onChange }: { s: State; value: NewVehicle; onChange: (v: NewVehicle) => void }) {
  const fields = [['lengthM', 'Długość (m)', 30], ['widthM', 'Szerokość (m)', 5], ['heightM', 'Wysokość (m)', 6], ['maxLoadKg', 'Ładowność (kg)', 50000], ['gvwKg', 'DMC (kg)', 60000]] as const;
  return <fieldset><legend>Nowy pojazd — zostanie zapisany we Flocie</legend><div className="catalog-fields">
    <label>ID nowego pojazdu (opcjonalnie)<input value={v.id ?? ''} maxLength={100} onChange={e => onChange({ ...v, id: e.target.value || undefined })} placeholder="System nada ID, jeśli pozostawisz puste" /></label>
    <label>Numer rejestracyjny<input required value={v.registrationNumber} maxLength={20} onChange={e => onChange({ ...v, registrationNumber: e.target.value.toUpperCase() })} /></label>
    <label>Wczytaj model<select aria-label="Wczytaj model" value="" onChange={e => { const m = s.models.find(m => m.id === e.target.value); if (m) onChange({ ...v, model: { name: m.name ?? m.id, lengthM: m.lengthM, widthM: m.widthM, heightM: m.heightM, maxLoadKg: m.maxLoadKg, gvwKg: m.gvwKg } }); }}><option value="">Wybierz model lub wpisz dane poniżej</option>{s.models.map(m => <option key={m.id} value={m.id}>{m.name ?? m.id} ({m.id})</option>)}</select></label>
    <label>Model / typ pojazdu<input required value={v.model.name} maxLength={120} onChange={e => onChange({ ...v, model: { ...v.model, name: e.target.value } })} /></label>
    {fields.map(([key, label, max]) => <label key={key}>{label}<input required type="number" step="any" min={key === 'maxLoadKg' ? 0 : 0.01} max={max} value={v.model[key]} onChange={e => onChange({ ...v, model: { ...v.model, [key]: Number(e.target.value) } })} /></label>)}
    <label>Paliwo<select aria-label="Paliwo" value={v.fuelType} onChange={e => onChange({ ...v, fuelType: e.target.value as NewVehicle['fuelType'] })}><option value="diesel">Diesel</option><option value="petrol">Benzyna</option><option value="electric">Elektryczny</option></select></label>
    <label>Norma Euro<select aria-label="Norma Euro" value={v.emissionStandard} onChange={e => onChange({ ...v, emissionStandard: Number(e.target.value) })}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>{i ? `Euro ${i}` : 'Brak / nie dotyczy'}</option>)}</select></label>
    <label>Rok produkcji<input required type="number" min={1900} max={2100} value={v.productionYear} onChange={e => onChange({ ...v, productionYear: Number(e.target.value) })} /></label></div>
    <div className="catalog-checks"><label><input type="checkbox" checked={v.hasCooling} onChange={e => onChange({ ...v, hasCooling: e.target.checked })} />Chłodnia</label><label><input type="checkbox" checked={v.dimensionsVerified} onChange={e => onChange({ ...v, dimensionsVerified: e.target.checked })} />Wymiary zweryfikowane</label></div>
  </fieldset>;
}

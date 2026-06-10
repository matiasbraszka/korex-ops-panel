import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '@korex/db';
import { INPUT_GROUPS, INPUT_KEYS } from '@korex/sales';

// Fecha de hoy en YYYY-MM-DD (zona local).
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const LOGO = 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38d8184c045c2748d55e8.png';

// Formulario publico (sin login) para que cualquier closer cargue su dia.
// Lee la lista de closers y guarda via RPCs SECURITY DEFINER (no expone la
// tabla al rol anonimo).
export default function PublicKpisForm() {
  const emptyForm = useMemo(() => Object.fromEntries(INPUT_KEYS.map((k) => [k, 0])), []);
  const [closers, setClosers] = useState([]);
  const [closerId, setCloserId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Cargar la lista de closers al abrir.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: e } = await supabase.rpc('list_closers_publico');
      if (!alive) return;
      if (e) setError('No se pudo cargar la lista de personas. Recargá la página.');
      else setClosers(data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!closerId) { setError('Elegí tu nombre.'); return; }
    if (!date) { setError('Elegí la fecha.'); return; }
    setSaving(true); setError('');
    const data = {};
    INPUT_KEYS.forEach((k) => { data[k] = Number(form[k] || 0); });
    const { error: e } = await supabase.rpc('submit_kpis_publico', {
      p_closer_id: closerId, p_date: date, p_data: data,
    });
    setSaving(false);
    if (e) { console.error(e); setError('No se pudo guardar. Intentá de nuevo.'); return; }
    setDone(true);
  };

  const inputClass = 'w-[96px] text-[14px] text-right border border-border rounded-lg px-2.5 py-2 outline-none focus:border-blue tabular-nums';
  const selectClass = 'w-full text-[14px] border border-border rounded-lg px-3 py-2.5 outline-none focus:border-blue bg-white';

  // Pantalla de exito tras guardar.
  if (done) {
    const who = closers.find((c) => c.closer_id === closerId)?.name || '';
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] bg-white border border-border rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-bg flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={30} className="text-green-600" />
          </div>
          <h1 className="text-[18px] font-bold text-text mb-1.5">¡Listo, {who.split(' ')[0]}!</h1>
          <p className="text-[13px] text-text2 mb-6">Guardamos tus números del {date}. Gracias por cargarlos.</p>
          <button
            onClick={() => { setForm(emptyForm); setDone(false); setDate(todayISO()); }}
            className="py-2.5 px-5 rounded-lg bg-blue text-white text-[13px] font-bold hover:bg-blue-dark cursor-pointer">
            Cargar otro día
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center p-4 py-8">
      <div className="w-full max-w-[520px]">
        {/* Header */}
        <div className="text-center mb-6">
          <img src={LOGO} alt="Método Korex" className="h-[40px] w-auto mx-auto mb-4" />
          <h1 className="text-[20px] font-bold text-text">Carga diaria de KPIs</h1>
          <p className="text-[13px] text-text2 mt-1">Completá tus números del día. Te lleva menos de un minuto.</p>
        </div>

        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* Quien + fecha */}
          <div className="p-5 border-b border-border space-y-3">
            <div>
              <label className="block text-[12px] font-semibold text-text mb-1.5">¿Quién sos?</label>
              <select value={closerId} onChange={(e) => setCloserId(e.target.value)} className={selectClass} disabled={loading}>
                <option value="">{loading ? 'Cargando…' : 'Elegí tu nombre'}</option>
                {closers.map((c) => <option key={c.closer_id} value={c.closer_id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-text mb-1.5">Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectClass} />
            </div>
          </div>

          {/* Campos agrupados */}
          <div className="p-5 space-y-5">
            {INPUT_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-text3 mb-2.5">{g.title}</div>
                <div className="space-y-2">
                  {g.fields.map((f) => (
                    <div key={f.key} className="flex items-center gap-3">
                      <span className="flex-1 text-[13.5px] text-text">{f.label}</span>
                      {f.kind === 'money' && <span className="text-[12px] text-text3">US$</span>}
                      <input type="number" min="0" step={f.kind === 'money' ? '0.01' : '1'} inputMode="decimal"
                             value={form[f.key] === 0 ? '' : form[f.key]}
                             onChange={(e) => set(f.key, e.target.value === '' ? 0 : Number(e.target.value))}
                             placeholder="0" className={inputClass} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {error && (
              <div className="bg-red-bg border border-red/30 text-red text-[12.5px] rounded-lg p-3">{error}</div>
            )}

            <button onClick={handleSubmit} disabled={saving}
                    className="w-full py-3 rounded-xl bg-blue text-white text-[15px] font-bold hover:bg-blue-dark disabled:opacity-60 cursor-pointer shadow-sm">
              {saving ? 'Guardando…' : 'Guardar mi día'}
            </button>
          </div>
        </div>

        <div className="text-center text-[11px] text-text3 mt-6">Método Korex · Ventas</div>
      </div>
    </div>
  );
}

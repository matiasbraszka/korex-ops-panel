import { useEffect, useState } from 'react';
import { INPUT_GROUPS, INPUT_KEYS, EMPTY_ROW } from '../../lib/closerKpis.js';

// Fecha de hoy en formato YYYY-MM-DD (zona local).
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Modal para cargar / editar el scorecard de un dia.
//  - Si ya existe una fila para (closer, fecha), prefilea sus valores.
//  - Admins pueden elegir el closer; los no-admin cargan siempre lo propio (meId).
export default function CloserDayModal({ open, onClose, onSaved, saveDay, onDelete, rows = [], closerOptions = [], meId, isAdmin, initialDate, initialCloserId }) {
  const [date, setDate] = useState(todayISO());
  const [closerId, setCloserId] = useState(meId || '');
  const [form, setForm] = useState({ ...EMPTY_ROW });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Al abrir, posicionar en la fecha/closer indicados (modo edicion desde la
  // tabla) o en hoy + el usuario actual (carga nueva), y cargar sus valores.
  useEffect(() => {
    if (!open) return;
    const d = initialDate || todayISO();
    const cid = initialCloserId || meId || '';
    setDate(d);
    setCloserId(cid);
    const existing = rows.find((r) => r.closer_id === cid && r.date === d);
    const next = { ...EMPTY_ROW };
    if (existing) INPUT_KEYS.forEach((k) => { next[k] = Number(existing[k] ?? 0); });
    setForm(next);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar fecha/closer MANUALMENTE: si ese dia ya tiene datos cargados, los
  // trae; si NO tiene, deja lo que el usuario escribio (no lo pisa con ceros).
  // Asi cambiar la fecha de un registro no borra los numeros tipeados.
  useEffect(() => {
    if (!open) return;
    const cid = isAdmin ? (closerId || meId) : meId;
    const existing = rows.find((r) => r.closer_id === cid && r.date === date);
    if (existing) {
      const next = { ...EMPTY_ROW };
      INPUT_KEYS.forEach((k) => { next[k] = Number(existing[k] ?? 0); });
      setForm(next);
    }
  }, [date, closerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const effectiveCid = isAdmin ? (closerId || meId) : meId;
  const existsRow = rows.some((r) => r.closer_id === effectiveCid && r.date === date);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleDelete = async () => {
    if (!existsRow) return;
    if (!window.confirm('¿Eliminar los datos de este día? Esta acción no se puede deshacer.')) return;
    setSaving(true); setError('');
    const res = await onDelete?.(date, effectiveCid);
    setSaving(false);
    if (res?.error) { setError(res.error); return; }
    onSaved?.();
    onClose?.();
  };

  const handleSave = async () => {
    const cid = isAdmin ? (closerId || meId) : meId;
    if (!cid) { setError('No se pudo identificar el closer.'); return; }
    if (!date) { setError('Elegí una fecha.'); return; }
    setSaving(true); setError('');
    const res = await saveDay(date, cid, form);
    if (res?.error) { setSaving(false); setError(res.error); return; }
    // Si estabamos editando un registro y cambio la fecha/closer, mover =
    // borrar el original para no dejar el dia viejo duplicado.
    const origCid = initialCloserId || meId;
    if (initialDate && onDelete && (date !== initialDate || cid !== origCid)) {
      await onDelete(initialDate, origCid);
    }
    setSaving(false);
    onSaved?.();
    onClose?.();
  };

  const inputClass = 'w-[92px] text-[13px] text-right border border-border rounded-md px-2 py-1.5 outline-none focus:border-blue tabular-nums';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
         style={{ background: 'rgba(26,29,38,0.35)' }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
           style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-text">Cargar día</h2>
              <p className="text-[11px] text-text2 mt-0.5">Scorecard de actividad del closer</p>
            </div>
            <button onClick={onClose}
                    className="text-text3 hover:text-text bg-transparent border-0 text-2xl leading-none cursor-pointer w-8 h-8 flex items-center justify-center rounded hover:bg-surface2">×</button>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                   className="text-[13px] border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-blue" />
            {isAdmin && closerOptions.length > 0 && (
              <select value={closerId} onChange={(e) => setCloserId(e.target.value)}
                      className="text-[13px] border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-blue flex-1 min-w-[160px] bg-white">
                {closerOptions.map((c) => (
                  <option key={c.user_id} value={c.user_id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {INPUT_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-text3 mb-2">{g.title}</div>
              <div className="space-y-1.5">
                {g.fields.map((f) => (
                  <div key={f.key} className="flex items-center gap-2.5 border border-border rounded-lg px-3 py-1.5">
                    <span className="flex-1 text-[12.5px] text-text">{f.label}</span>
                    {f.kind === 'money' && <span className="text-[11px] text-text3">US$</span>}
                    <input type="number" min="0" step={f.kind === 'money' ? '0.01' : '1'}
                           value={form[f.key] === 0 ? '' : form[f.key]}
                           onChange={(e) => set(f.key, e.target.value === '' ? 0 : Number(e.target.value))}
                           placeholder="0" className={inputClass} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {error && (
            <div className="bg-red-bg border border-red/30 text-red text-[12px] rounded-lg p-2.5">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-white flex items-center justify-between gap-2 rounded-b-xl">
          <div>
            {existsRow && onDelete && (
              <button onClick={handleDelete} disabled={saving}
                      className="py-2 px-3 rounded-lg border border-red/30 bg-white text-red text-[13px] font-medium hover:bg-red/10 disabled:opacity-50">
                Eliminar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving}
                    className="py-2 px-4 rounded-lg border border-border bg-white text-text2 text-[13px] font-medium hover:bg-surface2 disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
                    className="py-2 px-4 rounded-lg bg-blue text-white text-[13px] font-bold hover:bg-blue-dark disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

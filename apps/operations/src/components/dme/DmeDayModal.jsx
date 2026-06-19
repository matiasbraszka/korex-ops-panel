import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase } from '@korex/db';
import { INPUT_GROUPS, INPUT_KEYS, SECTIONS } from '../../lib/dme/registry.js';
import { computeDerived } from '../../lib/dme/derive.js';
import { metricTone } from '../../lib/dme/color.js';
import { fmtMetric } from '../../lib/dme/format.js';

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Form vacio: campos en blanco ('') -> lo que no se carga queda en blanco, no 0.
const EMPTY_STR = Object.fromEntries(INPUT_KEYS.map((k) => [k, '']));
// Metricas derivadas (para mostrarlas calculadas en vivo, read-only).
const DERIVED_METRICS = SECTIONS.flatMap((s) => s.metrics.filter((m) => m.type === 'derived' && !m.hidden));

// Modal para cargar / editar el DME de un dia (de un cliente fijo). Solo se cargan
// los INPUTS; los derivados (%, CPL, ROI...) se muestran calculados en vivo.
export default function DmeDayModal({ open, onClose, onSaved, saveDay, onDelete, rows = [], clientId, clientName, config, initialDate, isAdmin = false }) {
  const [date, setDate] = useState(todayISO());
  const [form, setForm] = useState({ ...EMPTY_STR });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [autoMsg, setAutoMsg] = useState('');
  const [autoLoading, setAutoLoading] = useState(false);

  const loadFor = (d) => {
    const existing = rows.find((r) => r.date === d);
    const next = { ...EMPTY_STR };
    if (existing?.metrics) INPUT_KEYS.forEach((k) => {
      const v = existing.metrics[k];
      if (v != null && v !== '') next[k] = Number(v); // campos sin dato quedan en blanco
    });
    setForm(next);
    setNote(existing?.note || '');
  };

  useEffect(() => {
    if (!open) return;
    const d = initialDate || todayISO();
    setDate(d);
    loadFor(d);
    setAutoMsg('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autocompleta las métricas de Finanzas (facturación, cashcollect, comisiones,
  // invertido, cargas) para este cliente + día. Lo demás se carga a mano.
  const handleAutofill = async () => {
    if (!clientId || !date) return;
    setAutoLoading(true); setAutoMsg('');
    const { data, error: e } = await supabase.rpc('dme_autofill_finanzas', { p_client_id: clientId, p_date: date });
    setAutoLoading(false);
    if (e) { setAutoMsg('No se pudo traer de Finanzas: ' + e.message); return; }
    const keys = Object.keys(data || {});
    if (!keys.length) { setAutoMsg('Sin movimientos de Finanzas para ese día.'); return; }
    setForm((f) => { const next = { ...f }; for (const k of keys) next[k] = Number(data[k]); return next; });
    setAutoMsg(`✓ Traído de Finanzas: ${keys.length} ${keys.length === 1 ? 'campo' : 'campos'}.`);
  };

  // Al cambiar la fecha: si ese dia ya tiene datos, los trae.
  useEffect(() => {
    if (!open) return;
    if (rows.some((r) => r.date === date)) loadFor(date);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo los campos cargados entran al calculo (los '' se omiten -> blanco).
  const derived = useMemo(() => {
    const nums = {};
    for (const k of INPUT_KEYS) { const v = form[k]; if (v !== '' && v != null) nums[k] = Number(v); }
    return computeDerived(nums, { days: 1 });
  }, [form]);

  if (!open) return null;

  const existsRow = rows.some((r) => r.date === date);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!date) { setError('Elegí una fecha.'); return; }
    setSaving(true); setError('');
    const res = await saveDay(date, form, note || null);
    if (res?.error) { setSaving(false); setError(res.error); return; }
    // Si se editaba un dia y se cambio la fecha, borrar el original.
    if (initialDate && date !== initialDate && onDelete) await onDelete(initialDate);
    setSaving(false);
    onSaved?.();
    onClose?.();
  };

  const handleDelete = async () => {
    if (!existsRow) return;
    if (!window.confirm('¿Eliminar los datos de este día? No se puede deshacer.')) return;
    setSaving(true); setError('');
    const res = await onDelete?.(date);
    setSaving(false);
    if (res?.error) { setError(res.error); return; }
    onSaved?.();
    onClose?.();
  };

  const inputClass = 'w-[96px] text-[13px] text-right border border-border rounded-md px-2 py-1.5 outline-none focus:border-blue tabular-nums';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
         style={{ background: 'rgba(26,29,38,0.35)' }} onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col"
           style={{ maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-text">Cargar día — DME</h2>
              <p className="text-[11px] text-text2 mt-0.5">{clientName || 'Cliente'} · métricas del día</p>
            </div>
            <button onClick={onClose}
                    className="text-text3 hover:text-text bg-transparent border-0 text-2xl leading-none cursor-pointer w-8 h-8 flex items-center justify-center rounded hover:bg-surface2">×</button>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                   className="text-[13px] border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-blue" />
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota del día (opcional)"
                   className="flex-1 min-w-[180px] text-[13px] border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-blue" />
          </div>
          {isAdmin && clientId && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button onClick={handleAutofill} disabled={autoLoading}
                      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-md border border-blue/30 bg-blue/5 text-blue hover:bg-blue/10 disabled:opacity-50 cursor-pointer">
                <Sparkles size={13} /> {autoLoading ? 'Trayendo…' : 'Traer de Finanzas'}
              </button>
              {autoMsg && <span className="text-[11px] text-text2">{autoMsg}</span>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {INPUT_GROUPS.filter((g) => isAdmin || !g.adminOnly).map((g) => (
            <div key={g.title}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-text3 mb-2">{g.title}</div>
              <div className="grid grid-cols-1 gap-1.5">
                {g.fields.map((f) => (
                  <div key={f.key} className="flex items-center gap-2.5 border border-border rounded-lg px-3 py-1.5">
                    <span className="flex-1 text-[12px] text-text">{f.label}</span>
                    {(f.kind === 'money' || f.kind === 'cpl') && <span className="text-[11px] text-text3">$</span>}
                    {f.kind === 'pct' && <span className="text-[11px] text-text3">%</span>}
                    <input type="number" step={f.kind === 'money' || f.kind === 'cpl' ? '0.01' : f.kind === 'pct' ? '0.01' : '1'}
                           value={form[f.key]}
                           onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))}
                           placeholder="—" className={inputClass} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Derivados en vivo (no editables) */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-text3 mb-2">Cálculo automático (no se carga)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {DERIVED_METRICS.map((m) => {
                const v = derived[m.key];
                const tone = metricTone(m.key, v, config);
                return (
                  <div key={m.key} title={m.help || undefined}
                       className={`flex items-center justify-between gap-2 bg-surface2/60 rounded-md px-2.5 py-1.5 ${m.help ? 'cursor-help' : ''}`}>
                    <span className="text-[11px] text-text3 truncate">{m.label}</span>
                    <span className="text-[12px] font-semibold tabular-nums px-1.5 rounded"
                          style={tone ? { background: tone.bg, color: tone.fg } : undefined}>
                      {fmtMetric(m.kind, v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div className="bg-red-bg border border-red/30 text-red text-[12px] rounded-lg p-2.5">{error}</div>}
        </div>

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
                    className="py-2 px-4 rounded-lg bg-blue text-white text-[13px] font-bold hover:bg-blue-dark disabled:opacity-50 shadow-sm">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

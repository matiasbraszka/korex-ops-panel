import { useEffect, useState } from 'react';
import { supabase } from '@korex/db';
import { initials } from './format.js';

// Modal de admin para fijar la meta USD por vendedor del MES en curso.
export default function TargetsModal({ open, onClose, sellers = [], targets = {}, onSaved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const init = {};
    sellers.forEach((s) => { init[s.user_id] = targets[s.user_id] != null ? String(targets[s.user_id]) : ''; });
    setValues(init);
    setError('');
  }, [open, sellers, targets]);

  if (!open) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const rows = sellers
      .map((s) => ({
        user_id: s.user_id,
        year, month,
        target_usd: Number(values[s.user_id] || 0),
      }))
      .filter((r) => r.target_usd >= 0);
    const { error: e } = await supabase
      .from('sales_targets')
      .upsert(rows, { onConflict: 'user_id,year,month' });
    setSaving(false);
    if (e) {
      console.error('TargetsModal upsert error:', e);
      setError(e.message || 'No se pudo guardar.');
      return;
    }
    onSaved?.();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
         style={{ background: 'rgba(26,29,38,0.35)' }}
         onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col"
           style={{ maxHeight: '90vh' }}
           onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-text">Metas del mes</h2>
            <p className="text-[11px] text-text2 mt-0.5">
              Meta USD por vendedor · {month.toString().padStart(2, '0')}/{year}
            </p>
          </div>
          <button onClick={onClose}
                  className="text-text3 hover:text-text bg-transparent border-0 text-2xl leading-none cursor-pointer w-8 h-8 flex items-center justify-center rounded hover:bg-surface2">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {sellers.length === 0 && (
            <div className="text-[12px] text-text3 text-center py-6">Sin vendedores cargados.</div>
          )}
          {sellers.map((s) => (
            <div key={s.user_id} className="flex items-center gap-2.5 border border-border rounded-lg px-3 py-2">
              {s.avatar_url
                ? <img src={s.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                : <span className="w-7 h-7 rounded-full inline-flex items-center justify-center font-bold text-[10px] text-white"
                        style={{ background: s.color || '#5B7CF5' }}>{s.initials || initials(s.name)}</span>}
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold truncate">{s.name}</div>
                <div className="text-[10px] text-text3 truncate">{s.role || 'Vendedor'}</div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-text3">US$</span>
                <input type="number" min="0" step="100"
                       value={values[s.user_id] ?? ''}
                       onChange={(e) => setValues((v) => ({ ...v, [s.user_id]: e.target.value }))}
                       placeholder="0"
                       className="w-[110px] text-[13px] text-right border border-border rounded-md px-2 py-1.5 outline-none focus:border-blue tabular-nums" />
              </div>
            </div>
          ))}
          {error && (
            <div className="bg-red-bg border border-red/30 text-red text-[12px] rounded-lg p-2.5 mt-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border bg-white flex items-center justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} disabled={saving}
                  className="py-2 px-4 rounded-lg border border-border bg-white text-text2 text-[13px] font-medium hover:bg-surface2 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || sellers.length === 0}
                  className="py-2 px-4 rounded-lg bg-blue text-white text-[13px] font-bold hover:bg-blue-dark disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

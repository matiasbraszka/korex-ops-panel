import { useState, useEffect } from 'react';
import { supabase } from '@korex/db';
import { Plus, FlaskConical } from 'lucide-react';
import Modal from '../Modal';
import StatusPill from '../StatusPill';
import {
  METRICAS, RESULTADOS, DECISIONES, REPLICABLE, resultadoPill, fmtFecha, MKT_ACCENT,
} from './constants';

const inputCls = 'w-full bg-white border border-border rounded-lg py-2 px-3 text-[13px] text-text font-sans outline-none focus:border-blue';
const labelCls = 'block text-[11px] font-semibold text-text2 mb-1';
const th = 'text-left py-2 px-2.5 bg-surface2 border border-border text-[10px] uppercase tracking-[0.5px] text-text3 font-semibold whitespace-nowrap';
const td = 'py-2 px-2.5 border border-border text-[12px] align-top';

function TestModal({ open, onClose, test, clients, onSaved }) {
  const isEdit = !!test?.id;
  const blank = {
    client_id: '', client_name: '', fecha_lanzamiento: new Date().toISOString().slice(0, 10),
    landing_url: '', hipotesis: '', metrica_primaria: '', periodo_dias: '', fecha_inicio: '',
    fecha_final: '', valor_antes: '', leads_muestra: '', invertido: '', metrica_despues: '',
    var_pct: '', resultado: 'En curso', decision: '', aprendizaje_clave: '', replicable: '',
  };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(test ? { ...blank, ...Object.fromEntries(Object.keys(blank).map(k => [k, test[k] ?? ''])) } : blank);
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, test?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const onCliente = (id) => { const c = clients.find(x => x.id === id); setForm(f => ({ ...f, client_id: id, client_name: c?.name || f.client_name })); };

  const save = async () => {
    setSaving(true); setErr('');
    const numKeys = ['periodo_dias', 'leads_muestra', 'invertido', 'var_pct'];
    const payload = {};
    for (const [k, v] of Object.entries(form)) {
      if (v === '') { payload[k] = null; continue; }
      payload[k] = numKeys.includes(k) ? Number(v) : v;
    }
    try {
      const res = isEdit
        ? await supabase.from('landing_tests').update(payload).eq('id', test.id).select().single()
        : await supabase.from('landing_tests').insert(payload).select().single();
      if (res.error) throw res.error;
      onSaved(res.data, isEdit ? 'update' : 'insert');
      onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!isEdit || !window.confirm(`¿Eliminar ${test.code}?`)) return;
    setSaving(true);
    const { error } = await supabase.from('landing_tests').delete().eq('id', test.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved(test, 'delete'); onClose();
  };

  const clientsSorted = [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <Modal open={open} onClose={onClose} maxWidth={680}
      title={isEdit ? `Editar ${test.code}` : 'Nuevo test A/B'}
      footer={<>
        {isEdit && <button onClick={remove} disabled={saving} className="py-2 px-3.5 rounded-lg border border-border bg-white text-red text-[13px] font-medium cursor-pointer hover:bg-red-bg mr-auto disabled:opacity-50">Eliminar</button>}
        <button onClick={onClose} className="py-2 px-3.5 rounded-lg border border-border bg-white text-text2 text-[13px] font-medium cursor-pointer hover:bg-surface2">Cancelar</button>
        <button onClick={save} disabled={saving} className="py-2 px-4 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60" style={{ background: MKT_ACCENT }}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div><label className={labelCls}>Cliente</label>
          <select className={inputCls} value={form.client_id || ''} onChange={e => onCliente(e.target.value)}>
            <option value="">{form.client_name ? `${form.client_name} (sin vincular)` : '— Elegir —'}</option>
            {clientsSorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Fecha lanzamiento</label><input type="date" className={inputCls} value={form.fecha_lanzamiento || ''} onChange={e => set('fecha_lanzamiento', e.target.value)} /></div>
        <div className="col-span-2 max-md:col-span-1"><label className={labelCls}>Landing URL</label><input className={inputCls} value={form.landing_url || ''} onChange={e => set('landing_url', e.target.value)} /></div>
        <div className="col-span-2 max-md:col-span-1"><label className={labelCls}>Hipótesis</label><textarea rows={2} className={inputCls + ' resize-y'} value={form.hipotesis || ''} onChange={e => set('hipotesis', e.target.value)} /></div>
        <div><label className={labelCls}>Métrica primaria</label>
          <select className={inputCls} value={form.metrica_primaria || ''} onChange={e => set('metrica_primaria', e.target.value)}>
            <option value="">— Elegir —</option>{METRICAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Período (días)</label><input type="number" className={inputCls} value={form.periodo_dias || ''} onChange={e => set('periodo_dias', e.target.value)} /></div>
        <div><label className={labelCls}>Fecha inicio</label><input type="date" className={inputCls} value={form.fecha_inicio || ''} onChange={e => set('fecha_inicio', e.target.value)} /></div>
        <div><label className={labelCls}>Fecha final</label><input type="date" className={inputCls} value={form.fecha_final || ''} onChange={e => set('fecha_final', e.target.value)} /></div>
        <div><label className={labelCls}>Valor antes</label><input className={inputCls} value={form.valor_antes || ''} onChange={e => set('valor_antes', e.target.value)} /></div>
        <div><label className={labelCls}>Métrica después</label><input className={inputCls} value={form.metrica_despues || ''} onChange={e => set('metrica_despues', e.target.value)} /></div>
        <div><label className={labelCls}>Leads (muestra)</label><input type="number" className={inputCls} value={form.leads_muestra || ''} onChange={e => set('leads_muestra', e.target.value)} /></div>
        <div><label className={labelCls}>Invertido ($)</label><input type="number" className={inputCls} value={form.invertido || ''} onChange={e => set('invertido', e.target.value)} /></div>
        <div><label className={labelCls}>Variación (%)</label><input type="number" className={inputCls} value={form.var_pct || ''} onChange={e => set('var_pct', e.target.value)} /></div>
        <div><label className={labelCls}>Resultado</label>
          <select className={inputCls} value={form.resultado || ''} onChange={e => set('resultado', e.target.value)}>{RESULTADOS.map(r => <option key={r} value={r}>{r}</option>)}</select>
        </div>
        <div><label className={labelCls}>Decisión</label>
          <select className={inputCls} value={form.decision || ''} onChange={e => set('decision', e.target.value)}><option value="">—</option>{DECISIONES.map(d => <option key={d} value={d}>{d}</option>)}</select>
        </div>
        <div><label className={labelCls}>¿Replicable?</label>
          <select className={inputCls} value={form.replicable || ''} onChange={e => set('replicable', e.target.value)}><option value="">—</option>{REPLICABLE.map(r => <option key={r} value={r}>{r}</option>)}</select>
        </div>
        <div className="col-span-2 max-md:col-span-1"><label className={labelCls}>Aprendizaje clave</label><textarea rows={2} className={inputCls + ' resize-y'} value={form.aprendizaje_clave || ''} onChange={e => set('aprendizaje_clave', e.target.value)} /></div>
      </div>
      {err && <div className="text-red text-xs mt-3">{err}</div>}
    </Modal>
  );
}

export default function TestsTab({ clients }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {} | test

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from('landing_tests').select('*').order('seq', { ascending: false });
      if (active) { setRows(data || []); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const onSaved = (row, action) => {
    setRows(prev => {
      if (action === 'delete') return prev.filter(r => r.id !== row.id);
      if (action === 'update') return prev.map(r => r.id === row.id ? row : r);
      return [row, ...prev];
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-text3">{rows.length} test{rows.length !== 1 ? 's' : ''} registrado{rows.length !== 1 ? 's' : ''}</div>
        <button onClick={() => setModal({})} className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none text-white text-[12px] font-semibold cursor-pointer" style={{ background: MKT_ACCENT }}>
          <Plus size={14} /> Nuevo test
        </button>
      </div>

      {loading ? <div className="text-text3 text-center py-12 text-sm">Cargando…</div>
        : rows.length === 0 ? (
          <div className="text-center py-16 text-text3">
            <FlaskConical size={32} className="mx-auto mb-2 opacity-40" />
            <div className="text-sm">Todavía no hay tests A/B cargados.</div>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl p-3 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>
                <th className={th}>ID</th><th className={th}>Cliente</th><th className={th}>Hipótesis</th>
                <th className={th}>Métrica</th><th className={th}>Antes</th><th className={th}>Después</th>
                <th className={th}>Var %</th><th className={th}>Resultado</th><th className={th}>Decisión</th>
              </tr></thead>
              <tbody>
                {rows.map(t => (
                  <tr key={t.id} className="cursor-pointer hover:bg-blue-bg2" onClick={() => setModal(t)}>
                    <td className={td + ' font-semibold whitespace-nowrap'}>{t.code}</td>
                    <td className={td + ' whitespace-nowrap'}>{t.client_name || '—'}<div className="text-[10px] text-text3">{fmtFecha(t.fecha_lanzamiento)}</div></td>
                    <td className={td} style={{ minWidth: 220 }}>{t.hipotesis || '—'}</td>
                    <td className={td}>{t.metrica_primaria || '—'}</td>
                    <td className={td}>{t.valor_antes || '—'}</td>
                    <td className={td}>{t.metrica_despues || '—'}</td>
                    <td className={td}>{t.var_pct != null ? `${t.var_pct}%` : '—'}</td>
                    <td className={td}><StatusPill text={t.resultado || 'En curso'} pillClass={resultadoPill(t.resultado)} /></td>
                    <td className={td}>{t.decision || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <TestModal open={!!modal} onClose={() => setModal(null)} test={modal?.id ? modal : null} clients={clients} onSaved={onSaved} />
    </div>
  );
}

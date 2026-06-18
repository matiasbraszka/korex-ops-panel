import { useState, useEffect } from 'react';
import { supabase } from '@korex/db';
import { Plus, Lightbulb } from 'lucide-react';
import Modal from '../Modal';
import {
  CATEGORIAS_APRENDIZAJE, FASES, fmtFecha, MKT_ACCENT,
} from './constants';

const inputCls = 'w-full bg-white border border-border rounded-lg py-2 px-3 text-[13px] text-text font-sans outline-none focus:border-blue';
const labelCls = 'block text-[11px] font-semibold text-text2 mb-1';

function InsightModal({ open, onClose, insight, onSaved }) {
  const isEdit = !!insight?.id;
  const blank = {
    fecha: new Date().toISOString().slice(0, 10), test_origen: '', client_origen: '',
    categoria: '', fase: '', seccion: '', aprendizaje: '', metrica_impactada: '',
    magnitud_pct: '', aplicabilidad: '',
  };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(insight ? { ...blank, ...Object.fromEntries(Object.keys(blank).map(k => [k, insight[k] ?? ''])) } : blank);
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, insight?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setErr('');
    const payload = {};
    for (const [k, v] of Object.entries(form)) payload[k] = v === '' ? null : (k === 'magnitud_pct' ? Number(v) : v);
    try {
      const res = isEdit
        ? await supabase.from('landing_insights').update(payload).eq('id', insight.id).select().single()
        : await supabase.from('landing_insights').insert(payload).select().single();
      if (res.error) throw res.error;
      onSaved(res.data, isEdit ? 'update' : 'insert');
      onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!isEdit || !window.confirm(`¿Eliminar ${insight.code}?`)) return;
    setSaving(true);
    const { error } = await supabase.from('landing_insights').delete().eq('id', insight.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved(insight, 'delete'); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={620}
      title={isEdit ? `Editar ${insight.code}` : 'Nuevo aprendizaje'}
      footer={<>
        {isEdit && <button onClick={remove} disabled={saving} className="py-2 px-3.5 rounded-lg border border-border bg-white text-red text-[13px] font-medium cursor-pointer hover:bg-red-bg mr-auto disabled:opacity-50">Eliminar</button>}
        <button onClick={onClose} className="py-2 px-3.5 rounded-lg border border-border bg-white text-text2 text-[13px] font-medium cursor-pointer hover:bg-surface2">Cancelar</button>
        <button onClick={save} disabled={saving} className="py-2 px-4 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60" style={{ background: MKT_ACCENT }}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div className="col-span-2 max-md:col-span-1"><label className={labelCls}>Aprendizaje</label><textarea rows={3} className={inputCls + ' resize-y'} value={form.aprendizaje || ''} onChange={e => set('aprendizaje', e.target.value)} /></div>
        <div><label className={labelCls}>Categoría</label>
          <select className={inputCls} value={form.categoria || ''} onChange={e => set('categoria', e.target.value)}><option value="">— Elegir —</option>{CATEGORIAS_APRENDIZAJE.map(c => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={form.fecha || ''} onChange={e => set('fecha', e.target.value)} /></div>
        <div><label className={labelCls}>Fase</label>
          <select className={inputCls} value={form.fase || ''} onChange={e => set('fase', e.target.value)}><option value="">—</option>{FASES.map(f => <option key={f} value={f}>{f}</option>)}</select>
        </div>
        <div><label className={labelCls}>Sección</label><input className={inputCls} value={form.seccion || ''} onChange={e => set('seccion', e.target.value)} /></div>
        <div><label className={labelCls}>Test origen</label><input className={inputCls} placeholder="ej: TST-0001" value={form.test_origen || ''} onChange={e => set('test_origen', e.target.value)} /></div>
        <div><label className={labelCls}>Cliente origen</label><input className={inputCls} value={form.client_origen || ''} onChange={e => set('client_origen', e.target.value)} /></div>
        <div><label className={labelCls}>Métrica impactada</label><input className={inputCls} value={form.metrica_impactada || ''} onChange={e => set('metrica_impactada', e.target.value)} /></div>
        <div><label className={labelCls}>Magnitud (%)</label><input type="number" className={inputCls} value={form.magnitud_pct || ''} onChange={e => set('magnitud_pct', e.target.value)} /></div>
        <div className="col-span-2 max-md:col-span-1"><label className={labelCls}>Aplicabilidad</label><input className={inputCls} placeholder="¿En qué otros funnels aplica?" value={form.aplicabilidad || ''} onChange={e => set('aplicabilidad', e.target.value)} /></div>
      </div>
      {err && <div className="text-red text-xs mt-3">{err}</div>}
    </Modal>
  );
}

export default function AprendizajesTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from('landing_insights').select('*').order('seq', { ascending: false });
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
        <div className="text-[12px] text-text3">Biblioteca de aprendizajes — qué funcionó y dónde replicarlo</div>
        <button onClick={() => setModal({})} className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none text-white text-[12px] font-semibold cursor-pointer shrink-0" style={{ background: MKT_ACCENT }}>
          <Plus size={14} /> Nuevo aprendizaje
        </button>
      </div>

      {loading ? <div className="text-text3 text-center py-12 text-sm">Cargando…</div>
        : rows.length === 0 ? (
          <div className="text-center py-16 text-text3">
            <Lightbulb size={32} className="mx-auto mb-2 opacity-40" />
            <div className="text-sm">Todavía no hay aprendizajes guardados.</div>
            <div className="text-[12px] mt-1">Cuando un test deje una conclusión replicable, guardala acá.</div>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
            {rows.map(i => (
              <div key={i.id} onClick={() => setModal(i)}
                className="bg-white border border-border rounded-xl p-4 cursor-pointer hover:border-blue hover:shadow-sm transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-text3">{i.code}</span>
                  {i.categoria && <span className="text-[9px] bg-purple-bg text-purple py-[2px] px-1.5 rounded font-medium">{i.categoria}</span>}
                </div>
                <div className="text-[13px] text-text font-medium mb-2">{i.aprendizaje || '—'}</div>
                <div className="text-[11px] text-text3 flex flex-wrap gap-x-3 gap-y-0.5">
                  {i.metrica_impactada && <span>{i.metrica_impactada}{i.magnitud_pct != null ? ` · ${i.magnitud_pct}%` : ''}</span>}
                  {i.fase && <span>{i.fase}</span>}
                  {i.client_origen && <span>{i.client_origen}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

      <InsightModal open={!!modal} onClose={() => setModal(null)} insight={modal?.id ? modal : null} onSaved={onSaved} />
    </div>
  );
}

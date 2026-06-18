import { useState, useEffect } from 'react';
import { supabase } from '@korex/db';
import Modal from '../Modal';
import {
  CATEGORIAS, FASES, URGENCIAS, ESTADOS, ENCARGADOS, SOLICITANTES, MKT_ACCENT,
} from './constants';

const inputCls =
  'w-full bg-white border border-border rounded-lg py-2 px-3 text-[13px] text-text font-sans outline-none focus:border-blue';
const labelCls = 'block text-[11px] font-semibold text-text2 mb-1';

function Field({ label, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

// Modal de alta / edición de un ticket de cambio de landing.
export default function TicketModal({ open, onClose, ticket, clients = [], onSaved }) {
  const isEdit = !!ticket?.id;
  const blank = {
    client_id: '', client_name: '', fecha_subida: new Date().toISOString().slice(0, 10),
    landing_url: '', categoria: '', fase: '', seccion: '', urgencia: 'Media',
    estado: 'Pendiente', encargado: '', solicitado_por: '', cambio_solicitado: '',
    referencia: '', docs_notas: '', imagen_resultado: '', fecha_entrega: '', comentarios: '',
  };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (ticket) {
      setForm({ ...blank, ...Object.fromEntries(Object.keys(blank).map(k => [k, ticket[k] ?? ''])) });
    } else {
      setForm(blank);
    }
    setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onClienteChange = (id) => {
    const c = clients.find(x => x.id === id);
    setForm(f => ({ ...f, client_id: id, client_name: c?.name || f.client_name }));
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    // Normalizamos vacíos a null para que la BD no guarde strings vacíos.
    const payload = {};
    for (const [k, v] of Object.entries(form)) payload[k] = v === '' ? null : v;
    try {
      let res;
      if (isEdit) {
        res = await supabase.from('landing_tickets').update(payload).eq('id', ticket.id).select().single();
      } else {
        res = await supabase.from('landing_tickets').insert(payload).select().single();
      }
      if (res.error) throw res.error;
      onSaved?.(res.data, isEdit ? 'update' : 'insert');
      onClose();
    } catch (e) {
      setErr(e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    if (!window.confirm(`¿Eliminar el ticket ${ticket.code}? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('landing_tickets').delete().eq('id', ticket.id);
      if (error) throw error;
      onSaved?.(ticket, 'delete');
      onClose();
    } catch (e) {
      setErr(e.message || 'No se pudo eliminar');
      setSaving(false);
    }
  };

  const clientsSorted = [...clients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={680}
      title={isEdit ? `Editar ${ticket.code}` : 'Nuevo cambio de landing'}
      footer={
        <>
          {isEdit && (
            <button onClick={remove} disabled={saving}
              className="py-2 px-3.5 rounded-lg border border-border bg-white text-red text-[13px] font-medium cursor-pointer hover:bg-red-bg mr-auto disabled:opacity-50">
              Eliminar
            </button>
          )}
          <button onClick={onClose} disabled={saving}
            className="py-2 px-3.5 rounded-lg border border-border bg-white text-text2 text-[13px] font-medium cursor-pointer hover:bg-surface2">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="py-2 px-4 rounded-lg border-none text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60"
            style={{ background: MKT_ACCENT }}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear ticket'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Field label="Cliente">
          <select className={inputCls} value={form.client_id || ''} onChange={e => onClienteChange(e.target.value)}>
            <option value="">{form.client_name ? `${form.client_name} (sin vincular)` : '— Elegir cliente —'}</option>
            {clientsSorted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Fecha de subida">
          <input type="date" className={inputCls} value={form.fecha_subida || ''} onChange={e => set('fecha_subida', e.target.value)} />
        </Field>

        <div className="col-span-2 max-md:col-span-1">
          <Field label="URL de la landing">
            <input type="text" className={inputCls} placeholder="https://…" value={form.landing_url || ''} onChange={e => set('landing_url', e.target.value)} />
          </Field>
        </div>

        <Field label="Categoría">
          <select className={inputCls} value={form.categoria || ''} onChange={e => set('categoria', e.target.value)}>
            <option value="">— Elegir —</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Fase del funnel">
          <select className={inputCls} value={form.fase || ''} onChange={e => set('fase', e.target.value)}>
            <option value="">— Elegir —</option>
            {FASES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>

        <Field label="Sección">
          <input type="text" className={inputCls} placeholder="ej: 1, 1 y 2, Todas" value={form.seccion || ''} onChange={e => set('seccion', e.target.value)} />
        </Field>
        <Field label="Urgencia">
          <select className={inputCls} value={form.urgencia || ''} onChange={e => set('urgencia', e.target.value)}>
            {URGENCIAS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>

        <Field label="Estado">
          <select className={inputCls} value={form.estado || ''} onChange={e => set('estado', e.target.value)}>
            {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Encargado">
          <input type="text" list="encargados-list" className={inputCls} value={form.encargado || ''} onChange={e => set('encargado', e.target.value)} />
          <datalist id="encargados-list">{ENCARGADOS.map(e => <option key={e} value={e} />)}</datalist>
        </Field>

        <div className="col-span-2 max-md:col-span-1">
          <Field label="Cambio solicitado">
            <textarea rows={3} className={inputCls + ' resize-y'} value={form.cambio_solicitado || ''} onChange={e => set('cambio_solicitado', e.target.value)} />
          </Field>
        </div>

        <Field label="Referencia (img/video/jam)">
          <input type="text" className={inputCls} placeholder="https://…" value={form.referencia || ''} onChange={e => set('referencia', e.target.value)} />
        </Field>
        <Field label="Docs / Notas">
          <input type="text" className={inputCls} placeholder="https://…" value={form.docs_notas || ''} onChange={e => set('docs_notas', e.target.value)} />
        </Field>

        <Field label="Resultado / URL nueva">
          <input type="text" className={inputCls} placeholder="URL del cambio hecho" value={form.imagen_resultado || ''} onChange={e => set('imagen_resultado', e.target.value)} />
        </Field>
        <Field label="Fecha de entrega">
          <input type="date" className={inputCls} value={form.fecha_entrega || ''} onChange={e => set('fecha_entrega', e.target.value)} />
        </Field>

        <Field label="Solicitado por">
          <input type="text" list="solicitantes-list" className={inputCls} value={form.solicitado_por || ''} onChange={e => set('solicitado_por', e.target.value)} />
          <datalist id="solicitantes-list">{SOLICITANTES.map(s => <option key={s} value={s} />)}</datalist>
        </Field>
        <div />

        <div className="col-span-2 max-md:col-span-1">
          <Field label="Comentarios">
            <textarea rows={2} className={inputCls + ' resize-y'} value={form.comentarios || ''} onChange={e => set('comentarios', e.target.value)} />
          </Field>
        </div>
      </div>

      {err && <div className="text-red text-xs mt-3">{err}</div>}
    </Modal>
  );
}

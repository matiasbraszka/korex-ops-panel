import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MoreVertical, MessageCircle, ChevronRight, Phone, Mail, Flame, Play, Check } from 'lucide-react';
import { supabase } from '@korex/db';

// LeadModal · diseño hi-fi Korex.
// - Header: back · titulo · pill WhatsApp · avatar/nombre/empresa
// - Tabs: Detalle · Llamadas (badge con count)
// - Detalle: secciones con label uppercase + caja redondeada
// - Llamadas: cards de cada llamada con resumen + boton ver grabacion
// - CTA: convertir a cliente cuando esta cerrado, sino footer eliminar/guardar
export default function LeadModal({
  open, onClose, lead, stages, salesTeam = [],
  canEditOwners, currentUserId,
  onCreate, onUpdate, onDelete, onConvertToClient,
}) {
  const [form, setForm] = useState(emptyForm(stages, currentUserId));
  const [calls, setCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [converting, setConverting] = useState(false);
  const [tab, setTab] = useState('detalle');

  useEffect(() => {
    if (!open) return;
    if (lead && lead.id) setForm({ ...emptyForm(stages, currentUserId), ...lead });
    else setForm({ ...emptyForm(stages, currentUserId), ...(lead || {}) });
    setTab('detalle');
  }, [open, lead, stages, currentUserId]);

  useEffect(() => {
    if (!open || !lead?.id) { setCalls([]); return; }
    let cancelled = false;
    setLoadingCalls(true);
    supabase.from('sales_v_lead_calls').select('*').eq('lead_id', lead.id)
      .order('fecha', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error(error);
        setCalls(data || []);
        setLoadingCalls(false);
      });
    return () => { cancelled = true; };
  }, [open, lead?.id]);

  if (!open) return null;
  const isEdit = !!lead?.id;
  const isClosed = !!form.closed_at;
  const stage = stages.find((s) => s.id === form.stage_id);
  const owner  = salesTeam.find((tm) => tm.user_id === form.owner_id);
  const setter = salesTeam.find((tm) => tm.user_id === form.setter_id);
  const ownerColor = owner?.color || '#5B7CF5';
  const initials = firstLast(form.full_name || '');
  const waUrl = whatsappUrl(form.phone);
  const created = form.created_at ? new Date(form.created_at) : null;
  const ago = created ? agoLabel(created) : 'recién';

  const buildPayload = () => ({
    full_name: form.full_name?.trim(),
    company_multinivel: form.company_multinivel?.trim() || null,
    proposal: form.proposal?.trim() || null,
    phone: form.phone?.trim() || null,
    email: form.email?.trim() || null,
    notes: form.notes?.trim() || null,
    stage_id: form.stage_id || null,
    next_step: form.next_step?.trim() || null,
    score: form.score ?? null,
    estimated_value: form.estimated_value === '' || form.estimated_value == null ? null : Number(form.estimated_value),
    estimated_currency: form.estimated_currency || 'USD',
    actual_value: form.actual_value === '' || form.actual_value == null ? null : Number(form.actual_value),
    actual_currency: form.actual_currency || form.estimated_currency || 'USD',
    ...(canEditOwners ? { owner_id: form.owner_id || null, setter_id: form.setter_id || null } : {}),
  });

  const handleSave = async () => {
    if (!form.full_name?.trim()) { alert('El nombre es obligatorio.'); return; }
    const payload = buildPayload();
    if (isEdit) await onUpdate(lead.id, payload);
    else await onCreate({ ...payload, stage_id: payload.stage_id || stages[0]?.id });
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este lead? No se puede deshacer.')) return;
    await onDelete(lead.id);
    onClose();
  };

  const handleConvert = async () => {
    if (!onConvertToClient || !lead?.id) return;
    if (!confirm(`¿Convertir "${form.full_name}" en cliente activo de Operaciones?`)) return;
    setConverting(true);
    try {
      const newClientId = await onConvertToClient(lead.id);
      alert(`Cliente creado en Operaciones (id: ${newClientId}).`);
      onClose();
    } catch (e) {
      alert('No se pudo convertir: ' + (e.message || e));
    } finally {
      setConverting(false);
    }
  };

  const patchField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <>
      {/* Backdrop: mobile dimmed; desktop transparente y absolute al body wrapper */}
      <div className="lead-modal-backdrop" onClick={onClose} />

      {/* Panel: mobile fullscreen fixed; desktop absolute width clamp(360,33vw,480) */}
      <div className="lead-modal-panel"
           onClick={(e) => e.stopPropagation()}>
        {/* Sheet header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
          <button onClick={onClose}
                  className="bg-transparent border-0 text-text2 hover:text-text hover:bg-surface2 rounded w-8 h-8 flex items-center justify-center cursor-pointer transition-colors">
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold leading-tight">{isEdit ? 'Detalle del lead' : 'Nuevo lead'}</div>
            {isEdit && (
              <div className="text-[9.5px] text-text3 mt-0.5">Agregado · {ago}</div>
            )}
          </div>
        </div>

        {/* Identity row — sin avatar de iniciales (no usamos fotos de leads) */}
        <div className="px-4 pt-3.5 pb-2.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <input
                value={form.full_name || ''}
                onChange={(e) => patchField('full_name', e.target.value)}
                placeholder="Nombre"
                className="w-full text-[15px] font-bold border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent leading-tight"
              />
              <input
                value={form.company_multinivel || ''}
                onChange={(e) => patchField('company_multinivel', e.target.value)}
                placeholder="Empresa / Multinivel"
                className="w-full text-[11px] text-text2 border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent mt-1"
              />
            </div>
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noreferrer"
                 className="bg-green-50 text-green-700 hover:bg-green-100 rounded-[9px] py-2 px-3 text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1.5 no-underline transition-colors shrink-0">
                <MessageCircle size={13} /> WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        {isEdit && (
          <div className="flex px-4 border-b border-border shrink-0">
            <TabBtn active={tab === 'detalle'} onClick={() => setTab('detalle')}>Detalle</TabBtn>
            <TabBtn active={tab === 'llamadas'} onClick={() => setTab('llamadas')} badge={calls.length}>Llamadas</TabBtn>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {(!isEdit || tab === 'detalle') && (
            <DetallePane
              form={form} setForm={setForm} patchField={patchField}
              stages={stages} salesTeam={salesTeam}
              canEditOwners={canEditOwners} isEdit={isEdit}
              stage={stage} owner={owner} setter={setter}
              isClosed={isClosed}
            />
          )}
          {isEdit && tab === 'llamadas' && (
            <LlamadasPane calls={calls} loading={loadingCalls} salesTeam={salesTeam} />
          )}
        </div>

        {/* Footer · CTA */}
        {isEdit && tab === 'detalle' && (
          isClosed && !form.client_id ? (
            <div className="px-4 py-3 border-t border-border bg-green-50/50 shrink-0 flex items-center gap-2.5">
              <span className="text-green-700"><Check size={18} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-green-800">Trato cerrado</div>
                <div className="text-[10.5px] text-green-700">Convertilo a cliente activo de Operaciones.</div>
              </div>
              <button onClick={handleConvert} disabled={converting}
                      className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-[12px] font-semibold rounded-md py-2 px-3 cursor-pointer border-0">
                {converting ? 'Convirtiendo…' : 'Convertir'}
              </button>
            </div>
          ) : form.client_id ? (
            <div className="px-4 py-3 border-t border-border bg-green-50 shrink-0">
              <div className="text-[12px] text-green-800 font-medium">
                ✓ Ya convertido a cliente de Operaciones
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between shrink-0">
              <button type="button" onClick={handleDelete}
                      className="text-[11.5px] text-red bg-transparent border-0 cursor-pointer p-0 font-medium hover:underline">
                Eliminar lead
              </button>
              <button type="button" onClick={handleSave}
                      className="bg-blue hover:bg-blue-dark text-white text-[12px] font-semibold rounded-md py-2 px-4 cursor-pointer border-0">
                Guardar cambios
              </button>
            </div>
          )
        )}
        {!isEdit && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2 shrink-0">
            <button type="button" onClick={onClose}
                    className="text-[12px] text-text2 bg-white border border-border hover:bg-surface2 rounded-md py-2 px-4 cursor-pointer">
              Cancelar
            </button>
            <button type="button" onClick={handleSave}
                    className="bg-blue hover:bg-blue-dark text-white text-[12px] font-semibold rounded-md py-2 px-4 cursor-pointer border-0">
              Crear lead
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function TabBtn({ active, onClick, badge, children }) {
  return (
    <button onClick={onClick}
            className="bg-transparent border-0 cursor-pointer py-2.5 px-3 text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors -mb-px"
            style={{
              color: active ? 'var(--color-text)' : 'var(--color-text3)',
              borderBottom: '2px solid ' + (active ? 'var(--color-blue)' : 'transparent'),
            }}>
      {children}
      {badge !== undefined && badge !== null && badge > 0 && (
        <span className="text-[9.5px] font-bold py-px px-1.5 rounded-full"
              style={{ background: active ? 'var(--color-blue-bg)' : 'var(--color-surface2)',
                       color: active ? 'var(--color-blue)' : 'var(--color-text3)' }}>{badge}</span>
      )}
    </button>
  );
}

function DetallePane({ form, patchField, stages, salesTeam, canEditOwners, isEdit, stage, owner, setter, isClosed }) {
  return (
    <div className="px-4 pt-4 pb-4 space-y-3.5">
      {/* Etapa */}
      <Field label="Etapa">
        <SelectBox value={form.stage_id || ''} onChange={(v) => patchField('stage_id', v)}
                   options={stages.map((s) => ({ value: s.id, label: s.name, color: s.color }))}
                   leadingDot={stage?.color} />
      </Field>

      {/* Próximo paso · highlight */}
      <Field label="Próximo paso">
        <div className="bg-blue-bg2 border border-blue-bg rounded-lg px-2.5 py-2">
          <textarea
            rows={2}
            value={form.next_step || ''}
            onChange={(e) => patchField('next_step', e.target.value)}
            placeholder="Llamar el viernes, enviar propuesta…"
            className="w-full text-[12.5px] text-text leading-snug bg-transparent border-0 outline-none resize-none placeholder:text-text3"
          />
        </div>
      </Field>

      {/* Probabilidad */}
      <Field label="Probabilidad">
        <div className="bg-surface2 rounded-lg px-2.5 py-2 flex items-center gap-2.5">
          <div className="flex items-center gap-0">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button"
                      onClick={() => patchField('score', form.score === n ? null : n)}
                      className="bg-transparent border-0 p-0.5 cursor-pointer">
                <Flame size={14}
                       fill={(form.score ?? 0) >= n ? '#F97316' : 'transparent'}
                       stroke={(form.score ?? 0) >= n ? '#F97316' : '#D1D5DB'}
                       strokeWidth={1.75} />
              </button>
            ))}
          </div>
          <span className="text-[12px] font-semibold flex-1">
            {['—', 'Baja', 'Media', 'Alta'][form.score || 0]}
          </span>
        </div>
      </Field>

      {/* Propuesta */}
      <Field label="Propuesta">
        <div className="bg-surface2 rounded-lg px-2.5 py-2">
          <textarea
            rows={2}
            value={form.proposal || ''}
            onChange={(e) => patchField('proposal', e.target.value)}
            placeholder="¿Qué le vamos a ofrecer?"
            className="w-full text-[12px] text-text2 leading-snug bg-transparent border-0 outline-none resize-none placeholder:text-text3 min-h-[36px]"
          />
        </div>
      </Field>

      {/* Contacto */}
      <Field label="Contacto">
        <div className="space-y-1">
          <RowField icon={Phone} value={form.phone || ''} placeholder="Teléfono"
                    onChange={(v) => patchField('phone', v)} />
          <RowField icon={Mail} value={form.email || ''} placeholder="correo@ejemplo.com"
                    onChange={(v) => patchField('email', v)} />
        </div>
      </Field>

      {/* Moneda + Monto */}
      <div className="grid grid-cols-[90px_1fr] gap-2">
        <Field label="Moneda">
          <SelectBox value={form.estimated_currency || 'USD'}
                     onChange={(v) => patchField('estimated_currency', v)}
                     options={['USD', 'EUR', 'MXN', 'ARS'].map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Monto estimado de cierre">
          <div className="bg-surface2 rounded-lg px-2.5 py-2">
            <input
              type="number" min="0" step="0.01"
              value={form.estimated_value ?? ''}
              onChange={(e) => patchField('estimated_value', e.target.value)}
              placeholder="0.00"
              className="w-full text-[14px] font-bold text-text bg-transparent border-0 outline-none tabular-nums placeholder:text-text3 placeholder:font-normal"
            />
          </div>
        </Field>
      </div>

      {/* Asignación */}
      <Field label="Asignación">
        <div className="grid grid-cols-2 gap-2">
          <AssignCard label="Dueño" person={owner} disabled={!canEditOwners && isEdit}
                      options={salesTeam}
                      onChange={(uid) => patchField('owner_id', uid || null)} />
          <AssignCard label="Setter" person={setter} disabled={!canEditOwners && isEdit}
                      options={salesTeam}
                      onChange={(uid) => patchField('setter_id', uid || null)} />
        </div>
      </Field>

      {/* Ingreso real (solo si esta cerrado) */}
      {isClosed && (
        <div className="grid grid-cols-[90px_1fr] gap-2 bg-green-50 border border-green-200 rounded-lg p-2">
          <Field label="Moneda real">
            <SelectBox value={form.actual_currency || form.estimated_currency || 'USD'}
                       onChange={(v) => patchField('actual_currency', v)}
                       options={['USD', 'EUR', 'MXN', 'ARS'].map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label="Ingreso real (cierre)">
            <div className="bg-white rounded-lg px-2.5 py-2 border border-green-200">
              <input
                type="number" min="0" step="0.01"
                value={form.actual_value ?? ''}
                onChange={(e) => patchField('actual_value', e.target.value)}
                placeholder="0.00"
                className="w-full text-[14px] font-bold text-text bg-transparent border-0 outline-none tabular-nums"
              />
            </div>
          </Field>
        </div>
      )}

      {/* Notas */}
      <Field label="Notas">
        <div className="bg-surface2 rounded-lg px-2.5 py-2">
          <textarea
            rows={3}
            value={form.notes || ''}
            onChange={(e) => patchField('notes', e.target.value)}
            placeholder="Historial, observaciones…"
            className="w-full text-[12px] text-text2 leading-snug bg-transparent border-0 outline-none resize-none placeholder:text-text3 min-h-[60px]"
          />
        </div>
      </Field>
    </div>
  );
}

function LlamadasPane({ calls, loading, salesTeam }) {
  if (loading) return <div className="px-4 py-8 text-center text-[12px] text-text3">Cargando llamadas…</div>;
  if (calls.length === 0) return (
    <div className="px-4 py-12 text-center">
      <div className="text-[12px] text-text3">Sin llamadas registradas para este lead.</div>
    </div>
  );
  const connected = calls.filter((c) => c.duracion_min > 0).length;

  return (
    <div className="px-4 pt-3 pb-4 space-y-2">
      <div className="text-[10.5px] text-text3 flex justify-between px-0.5 pb-1">
        <span className="font-semibold">{connected} conectadas · {calls.length} totales</span>
        <span>Más reciente primero</span>
      </div>
      {calls.map((c) => {
        const conn = (c.duracion_min || 0) > 0;
        const team = salesTeam.find((tm) => tm.user_id === c.user_id);
        return (
          <div key={c.llamada_id || c.id}
               className={`rounded-lg px-3 py-2.5 border ${conn ? 'bg-surface2 border-border' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-start gap-2">
              <span className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${
                conn ? 'bg-green-50 text-green-700' : 'bg-red-100 text-red'
              }`}>
                <Phone size={13} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-text truncate">{c.titulo || 'Llamada'}</div>
                <div className="text-[10.5px] text-text3 mt-0.5 flex items-center gap-2">
                  <span>{c.fecha ? new Date(c.fecha).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  {conn && <><span>·</span><span>{c.duracion_min} min</span></>}
                  {team && <>
                    <span>·</span>
                    <span className="w-3.5 h-3.5 rounded-full text-[7px] font-bold flex items-center justify-center"
                          style={{ background: (team.color || '#5B7CF5') + '24', color: team.color || '#5B7CF5' }}>
                      {team.initials}
                    </span>
                  </>}
                </div>
              </div>
            </div>
            {c.resumen && (
              <div className="text-[11.5px] text-text2 mt-2 leading-snug pl-9">{c.resumen}</div>
            )}
            {c.recording_url && (
              <div className="pl-9 mt-2">
                <a href={c.recording_url} target="_blank" rel="noreferrer"
                   className="bg-white border border-border rounded-md px-2.5 py-1 text-[11px] font-semibold text-blue hover:bg-blue-bg2 inline-flex items-center gap-1.5 no-underline transition-colors">
                  <Play size={10} /> Ver grabación
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[9.5px] font-bold tracking-[0.08em] text-text3 uppercase mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function SelectBox({ value, onChange, options, leadingDot }) {
  const sel = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <div className="bg-surface2 rounded-lg px-2.5 py-2 flex items-center gap-2 cursor-pointer">
        {leadingDot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: leadingDot }} />}
        <span className="text-[12.5px] font-semibold flex-1">{sel?.label || '—'}</span>
        <ChevronRight size={14} className="text-text3 rotate-90" />
      </div>
      <select value={value || ''} onChange={(e) => onChange?.(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function RowField({ icon: Icon, value, placeholder, onChange }) {
  return (
    <div className="bg-surface2 rounded-lg px-2.5 py-2 flex items-center gap-2">
      <span className="text-text3 shrink-0"><Icon size={13} /></span>
      <input
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-[12.5px] text-text bg-transparent border-0 outline-none placeholder:text-text3"
      />
    </div>
  );
}

function AssignCard({ label, person, disabled, options, onChange }) {
  const color = person?.color || '#5B7CF5';
  return (
    <div className="bg-surface2 rounded-lg px-2 py-1.5 flex items-center gap-2 relative">
      {person ? (
        person.avatar_url ? (
          <img src={person.avatar_url} alt={person.name} className="w-[22px] h-[22px] rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center font-bold text-[9px] shrink-0"
                style={{ background: color + '24', color }}>
            {person.initials || person.name?.slice(0, 2).toUpperCase()}
          </span>
        )
      ) : (
        <span className="w-[22px] h-[22px] rounded-full bg-surface3 border border-dashed border-border flex items-center justify-center text-text3 text-[9px] shrink-0">?</span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wider text-text3">{label}</div>
        <div className="text-[11px] font-semibold truncate">{person?.name || 'Sin asignar'}</div>
      </div>
      <ChevronRight size={12} className="text-text3" />
      {!disabled && (
        <select value={person?.user_id || ''} onChange={(e) => onChange?.(e.target.value || null)}
                className="absolute inset-0 opacity-0 cursor-pointer">
          <option value="">Sin asignar</option>
          {options.map((tm) => <option key={tm.user_id} value={tm.user_id}>{tm.name}</option>)}
        </select>
      )}
    </div>
  );
}

function emptyForm(stages, currentUserId) {
  return {
    full_name: '',
    company_multinivel: '',
    proposal: '',
    phone: '',
    email: '',
    notes: '',
    stage_id: stages?.[0]?.id || '',
    owner_id: currentUserId || null,
    setter_id: null,
    next_step: '',
    score: null,
    estimated_value: '',
    estimated_currency: 'USD',
    actual_value: '',
    actual_currency: '',
  };
}

function whatsappUrl(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/[^\d]/g, '');
  if (!clean) return null;
  return `https://wa.me/${clean}`;
}

function firstLast(name = '') {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function agoLabel(date) {
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} semanas`;
  return date.toLocaleDateString('es-AR');
}

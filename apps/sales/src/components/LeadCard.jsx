import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flame, MessageCircle, MoreHorizontal } from 'lucide-react';

// Card de lead con TODO editable inline:
// - Nombre y empresa (input que se guarda al blur).
// - Score 1-3 con fueguitos clickeables.
// - Owner + Setter avatares (informativos; cambian solo desde modal por admin).
// - Monto estimado (input) con selector de moneda.
// - Próximo paso (textarea).
// - Botón WhatsApp si hay teléfono.
// - "···" abre el modal con detalles secundarios (notas, telefono, email,
//   historial de llamadas, asignacion).
//
// Stop-propagation en eventos de pointerdown sobre inputs/buttons para
// evitar que el listener de drag los robe.

const CURRENCIES = ['USD', 'EUR', 'MXN', 'ARS'];
const CURRENCY_SIGN = { USD: '$', EUR: '€', MXN: 'MX$', ARS: '$' };

export default function LeadCard({ lead, owner, setter, onDetail, onPatch, canEditOwners }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id, data: { type: 'lead', stage_id: lead.stage_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // El stopPropagation evita que el click/drag empiece desde dentro de inputs.
  const stop = (e) => e.stopPropagation();

  // Estado local para edicion inline; persiste en blur si cambio.
  const [name, setName]       = useState(lead.full_name || '');
  const [company, setCompany] = useState(lead.company_multinivel || '');
  const [nextStep, setNextStep] = useState(lead.next_step || '');
  const [estimated, setEstimated] = useState(lead.estimated_value ?? '');
  const [currency, setCurrency] = useState(lead.estimated_currency || 'USD');

  // Resync si llegan cambios remotos (sin tocar lo que el user esta editando).
  const focusedRef = useRef(null);
  useEffect(() => { if (focusedRef.current !== 'name')     setName(lead.full_name || ''); },        [lead.full_name]);
  useEffect(() => { if (focusedRef.current !== 'company')  setCompany(lead.company_multinivel || ''); }, [lead.company_multinivel]);
  useEffect(() => { if (focusedRef.current !== 'nextStep') setNextStep(lead.next_step || ''); },     [lead.next_step]);
  useEffect(() => { if (focusedRef.current !== 'estimated') setEstimated(lead.estimated_value ?? ''); }, [lead.estimated_value]);
  useEffect(() => { setCurrency(lead.estimated_currency || 'USD'); }, [lead.estimated_currency]);

  const persistIfChanged = (key, current, original) => {
    if ((current ?? '') === (original ?? '')) return;
    if (key === 'estimated_value') {
      const num = current === '' ? null : Number(current);
      if (num !== null && Number.isNaN(num)) return;
      onPatch?.({ estimated_value: num });
    } else {
      onPatch?.({ [key]: (current ?? '').toString().trim() || null });
    }
  };

  const setScore = (n) => {
    const next = lead.score === n ? null : n;
    onPatch?.({ score: next });
  };

  const waUrl = whatsappUrl(lead.phone);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white border border-border rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing hover:border-blue/60 transition-colors space-y-2"
    >
      {/* Header: avatares + score + acciones */}
      <div className="flex items-center gap-2" onPointerDown={stop}>
        <div className="flex -space-x-2">
          {owner ? (
            <Avatar tm={owner} title={`Dueño: ${owner.name}`} ring="ring-2 ring-white" />
          ) : (
            <EmptyAvatar title="Sin dueño" />
          )}
          {setter ? (
            <Avatar tm={setter} title={`Seguidor: ${setter.name}`} ring="ring-2 ring-white" />
          ) : (
            <EmptyAvatar title="Sin seguidor" dashed />
          )}
        </div>

        {/* Score con fueguitos */}
        <div className="flex items-center gap-0.5 ml-auto">
          {[1, 2, 3].map((n) => (
            <button
              key={n} type="button"
              onClick={(e) => { stop(e); setScore(n); }}
              onPointerDown={stop}
              title={`Probabilidad ${n}/3`}
              className="bg-transparent border-0 p-0.5 cursor-pointer"
            >
              <Flame
                size={14}
                fill={(lead.score ?? 0) >= n ? '#F97316' : 'transparent'}
                stroke={(lead.score ?? 0) >= n ? '#F97316' : '#D1D5DB'}
                strokeWidth={1.75}
              />
            </button>
          ))}
        </div>

        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer"
             onPointerDown={stop} onClick={stop}
             title={`WhatsApp: ${lead.phone}`}
             className="text-green-600 hover:bg-green-50 rounded p-1 -m-1">
            <MessageCircle size={15} />
          </a>
        )}
        <button onPointerDown={stop} onClick={(e) => { stop(e); onDetail?.(); }}
                title="Ver detalle / editar todo"
                className="text-text3 hover:text-text bg-transparent border-0 p-1 -m-1 cursor-pointer">
          <MoreHorizontal size={15} />
        </button>
      </div>

      {/* Nombre */}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={() => { focusedRef.current = 'name'; }}
        onBlur={() => { focusedRef.current = null; persistIfChanged('full_name', name, lead.full_name); }}
        onPointerDown={stop}
        placeholder="Nombre"
        className="w-full text-[13px] font-semibold text-text border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent"
      />

      {/* Empresa */}
      <input
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        onFocus={() => { focusedRef.current = 'company'; }}
        onBlur={() => { focusedRef.current = null; persistIfChanged('company_multinivel', company, lead.company_multinivel); }}
        onPointerDown={stop}
        placeholder="Empresa multinivel"
        className="w-full text-[11px] text-text2 border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent"
      />

      {/* Próximo paso */}
      <textarea
        rows={2}
        value={nextStep}
        onChange={(e) => setNextStep(e.target.value)}
        onFocus={() => { focusedRef.current = 'nextStep'; }}
        onBlur={() => { focusedRef.current = null; persistIfChanged('next_step', nextStep, lead.next_step); }}
        onPointerDown={stop}
        placeholder="Próximo paso…"
        className="w-full text-[11px] text-text2 border border-border focus:border-blue rounded px-1.5 py-1 outline-none bg-bg resize-y"
      />

      {/* Monto estimado */}
      <div className="flex items-center gap-1" onPointerDown={stop}>
        <select
          value={currency}
          onChange={(e) => { setCurrency(e.target.value); onPatch?.({ estimated_currency: e.target.value }); }}
          onPointerDown={stop}
          className="text-[10px] text-text2 border border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-bg cursor-pointer"
        >
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-[11px] text-text3">{CURRENCY_SIGN[currency] || ''}</span>
        <input
          type="number" min="0" step="0.01"
          value={estimated}
          onChange={(e) => setEstimated(e.target.value)}
          onFocus={() => { focusedRef.current = 'estimated'; }}
          onBlur={() => { focusedRef.current = null; persistIfChanged('estimated_value', estimated, lead.estimated_value); }}
          onPointerDown={stop}
          placeholder="Monto estimado"
          className="flex-1 text-[11px] border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent"
        />
      </div>

      {lead.origin === 'llamada_auto' && (
        <div className="text-[9px] text-blue uppercase tracking-wider">Desde llamada</div>
      )}
      {lead.closed_at && (
        <div className="text-[9px] text-green-600 uppercase tracking-wider">
          Cerrado · {new Date(lead.closed_at).toLocaleDateString('es-AR')}
        </div>
      )}
    </div>
  );
}

function Avatar({ tm, title, ring = '' }) {
  if (tm.avatar_url) {
    return (
      <img src={tm.avatar_url} alt={tm.name} title={title}
           className={`w-7 h-7 rounded-full object-cover ${ring}`} />
    );
  }
  return (
    <div title={title}
         className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${ring}`}
         style={{ background: (tm.color || '#5B7CF5') + '24', color: tm.color || '#5B7CF5' }}>
      {tm.initials || tm.name?.slice(0, 2).toUpperCase()}
    </div>
  );
}

function EmptyAvatar({ title, dashed }) {
  return (
    <div title={title}
         className={`w-7 h-7 rounded-full bg-surface2 ring-2 ring-white flex items-center justify-center text-text3 text-[10px] ${dashed ? 'border-2 border-dashed border-border' : ''}`}>
      ?
    </div>
  );
}

function whatsappUrl(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/[^\d]/g, '');
  if (!clean) return null;
  return `https://wa.me/${clean}`;
}

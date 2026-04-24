import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Flame, MessageCircle, MoreHorizontal, GripVertical,
  User, UserCheck, ArrowRight,
} from 'lucide-react';

// Card del Kanban con TODO editable inline.
//   Drag handle dedicado arriba (icono ⋮⋮) -> ahí van los listeners de @dnd-kit.
//   Resto del card es interactivo (inputs, selects, botones) sin stopPropagation.

const CURRENCIES = ['USD', 'EUR', 'MXN', 'ARS'];
const CURRENCY_SIGN = { USD: '$', EUR: '€', MXN: 'MX$', ARS: '$' };

export default function LeadCard({
  lead, owner, setter, salesTeam = [], canEditOwners,
  onDetail, onPatch,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: 'lead', stage_id: lead.stage_id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Estado local para inputs (persiste al blur si cambió).
  const [name, setName]         = useState(lead.full_name || '');
  const [company, setCompany]   = useState(lead.company_multinivel || '');
  const [nextStep, setNextStep] = useState(lead.next_step || '');
  const [estimated, setEstimated] = useState(lead.estimated_value ?? '');
  const [currency, setCurrency]   = useState(lead.estimated_currency || 'USD');

  const focusedRef = useRef(null);
  useEffect(() => { if (focusedRef.current !== 'name')      setName(lead.full_name || ''); },              [lead.full_name]);
  useEffect(() => { if (focusedRef.current !== 'company')   setCompany(lead.company_multinivel || ''); },  [lead.company_multinivel]);
  useEffect(() => { if (focusedRef.current !== 'nextStep')  setNextStep(lead.next_step || ''); },          [lead.next_step]);
  useEffect(() => { if (focusedRef.current !== 'estimated') setEstimated(lead.estimated_value ?? ''); },   [lead.estimated_value]);
  useEffect(() => { setCurrency(lead.estimated_currency || 'USD'); }, [lead.estimated_currency]);

  const persist = (key, value, original) => {
    if ((value ?? '') === (original ?? '')) return;
    if (key === 'estimated_value') {
      const num = value === '' ? null : Number(value);
      if (num !== null && Number.isNaN(num)) return;
      onPatch?.({ estimated_value: num });
    } else {
      onPatch?.({ [key]: (value ?? '').toString().trim() || null });
    }
  };

  const setScore = (n) => {
    onPatch?.({ score: lead.score === n ? null : n });
  };

  const waUrl = whatsappUrl(lead.phone);

  return (
    <div ref={setNodeRef} style={style}
         className="bg-white border border-border rounded-lg mb-2 overflow-hidden hover:border-blue/60 transition-colors">
      {/* DRAG HANDLE: solo este recibe los listeners. */}
      <div {...attributes} {...listeners}
           className="flex items-center justify-between px-2 py-1 bg-gradient-to-b from-surface2/60 to-transparent cursor-grab active:cursor-grabbing border-b border-border/50">
        <GripVertical size={13} className="text-text3" />
        {/* Score (clickeable, fuera del handle real) */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3].map((n) => (
            <button key={n} type="button"
                    onClick={() => setScore(n)}
                    onPointerDown={(e) => e.stopPropagation()}
                    title={`Probabilidad ${n}/3`}
                    className="bg-transparent border-0 p-0.5 cursor-pointer">
              <Flame size={13}
                     fill={(lead.score ?? 0) >= n ? '#F97316' : 'transparent'}
                     stroke={(lead.score ?? 0) >= n ? '#F97316' : '#D1D5DB'}
                     strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>

      {/* CONTENIDO INTERACTIVO */}
      <div className="p-2.5 space-y-2">
        {/* Nombre */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => { focusedRef.current = 'name'; }}
          onBlur={() => { focusedRef.current = null; persist('full_name', name, lead.full_name); }}
          placeholder="Nombre completo"
          className="w-full text-[14px] font-bold text-text border border-transparent hover:border-border focus:border-blue rounded px-1.5 py-0.5 outline-none bg-transparent"
        />

        {/* Empresa */}
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          onFocus={() => { focusedRef.current = 'company'; }}
          onBlur={() => { focusedRef.current = null; persist('company_multinivel', company, lead.company_multinivel); }}
          placeholder="Empresa multinivel"
          className="w-full text-[11px] text-text2 border border-transparent hover:border-border focus:border-blue rounded px-1.5 py-0.5 outline-none bg-transparent"
        />

        {/* ASIGNACIÓN */}
        <div className="flex items-center gap-2 pt-0.5">
          <AssigneePicker
            icon={<User size={11} />}
            label="Dueño"
            valueId={lead.owner_id}
            valuePerson={owner}
            options={salesTeam}
            disabled={!canEditOwners}
            onChange={(uid) => onPatch?.({ owner_id: uid || null })}
          />
          <AssigneePicker
            icon={<UserCheck size={11} />}
            label="Setter"
            valueId={lead.setter_id}
            valuePerson={setter}
            options={salesTeam}
            disabled={!canEditOwners}
            onChange={(uid) => onPatch?.({ setter_id: uid || null })}
          />
        </div>

        {/* PRÓXIMO PASO */}
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <ArrowRight size={10} className="text-blue" />
            <span className="text-[9px] font-bold text-text3 uppercase tracking-wider">Próximo paso</span>
          </div>
          <textarea
            rows={2}
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            onFocus={() => { focusedRef.current = 'nextStep'; }}
            onBlur={() => { focusedRef.current = null; persist('next_step', nextStep, lead.next_step); }}
            placeholder="Llamar el viernes, mandar propuesta…"
            className="w-full text-[11px] text-text2 border border-border focus:border-blue rounded px-2 py-1 outline-none bg-bg resize-y"
          />
        </div>

        {/* MONTO */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[10px] font-bold text-text3 uppercase tracking-wider shrink-0">Estimado</span>
          <select
            value={currency}
            onChange={(e) => { setCurrency(e.target.value); onPatch?.({ estimated_currency: e.target.value }); }}
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
            onBlur={() => { focusedRef.current = null; persist('estimated_value', estimated, lead.estimated_value); }}
            placeholder="0.00"
            className="flex-1 min-w-0 text-[11px] text-text border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent text-right"
          />
        </div>

        {/* BADGES */}
        {(lead.origin === 'llamada_auto' || lead.closed_at) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {lead.origin === 'llamada_auto' && (
              <span className="text-[9px] bg-blue-bg text-blue px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold">Desde llamada</span>
            )}
            {lead.closed_at && (
              <span className="text-[9px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold">
                ✓ Cerrado · {new Date(lead.closed_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </div>
        )}

        {/* FOOTER: acciones */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60 -mx-2.5 px-2.5">
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noreferrer"
               title={`WhatsApp: ${lead.phone}`}
               className="flex items-center gap-1 text-[11px] text-green-600 hover:bg-green-50 rounded px-1.5 py-1">
              <MessageCircle size={13} /> WhatsApp
            </a>
          ) : (
            <span className="text-[10px] text-text3 px-1.5">Sin teléfono</span>
          )}
          <button onClick={onDetail}
                  title="Ver detalle"
                  className="text-text3 hover:text-text bg-transparent border-0 px-1.5 py-1 cursor-pointer flex items-center gap-1 text-[10px]">
            Detalle <MoreHorizontal size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Pequeño picker para owner/setter: muestra avatar + nombre y un select
// nativo encima invisible para que admin elija. Si disabled, queda solo visual.
function AssigneePicker({ icon, label, valueId, valuePerson, options, disabled, onChange }) {
  return (
    <div className={`flex-1 min-w-0 relative flex items-center gap-1.5 px-1.5 py-1 rounded border border-transparent ${disabled ? '' : 'hover:border-border hover:bg-surface2/70 cursor-pointer'}`}>
      <span className="text-text3 shrink-0" title={label}>{icon}</span>
      {valuePerson ? (
        valuePerson.avatar_url ? (
          <img src={valuePerson.avatar_url} alt={valuePerson.name}
               className="w-5 h-5 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[8px] shrink-0"
                style={{ background: (valuePerson.color || '#5B7CF5') + '24', color: valuePerson.color || '#5B7CF5' }}>
            {valuePerson.initials || valuePerson.name?.slice(0, 2).toUpperCase()}
          </span>
        )
      ) : (
        <span className="w-5 h-5 rounded-full bg-surface2 border border-dashed border-border flex items-center justify-center text-text3 text-[8px] shrink-0">?</span>
      )}
      <span className="text-[11px] text-text2 truncate flex-1">
        {valuePerson?.name || <em className="text-text3">Sin asignar</em>}
      </span>
      {!disabled && (
        <select
          value={valueId || ''}
          onChange={(e) => onChange?.(e.target.value || null)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label={label}
        >
          <option value="">Sin asignar</option>
          {options.map((tm) => (
            <option key={tm.user_id} value={tm.user_id}>{tm.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function whatsappUrl(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/[^\d]/g, '');
  if (!clean) return null;
  return `https://wa.me/${clean}`;
}

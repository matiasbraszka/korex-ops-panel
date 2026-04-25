import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flame, MessageCircle, MoreHorizontal, ArrowRight, Trash2 } from 'lucide-react';

// LeadCard · diseño Korex hi-fi.
// - Toda la card es draggable (no hay handle lateral).
// - Click en zonas vacias abre el detalle. Click en inputs/avatars/wa NO.
// - Score inline · proximo paso destacado · avatars apilados · WhatsApp pill.
export default function LeadCard({
  lead, owner, setter, salesTeam = [], canEditOwners,
  onDetail, onPatch, onDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id, data: { type: 'lead', stage_id: lead.stage_id },
  });

  const [name, setName]           = useState(lead.full_name || '');
  const [nextStep, setNextStep]   = useState(lead.next_step || '');
  const [estimated, setEstimated] = useState(lead.estimated_value ?? '');

  const focusedRef = useRef(null);
  useEffect(() => { if (focusedRef.current !== 'name')      setName(lead.full_name || ''); },              [lead.full_name]);
  useEffect(() => { if (focusedRef.current !== 'nextStep')  setNextStep(lead.next_step || ''); },          [lead.next_step]);
  useEffect(() => { if (focusedRef.current !== 'estimated') setEstimated(lead.estimated_value ?? ''); },   [lead.estimated_value]);

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

  const setScore = (n) => onPatch?.({ score: lead.score === n ? null : n });
  const waUrl = whatsappUrl(lead.phone);
  const showAmount = Number(lead.estimated_value) > 0;

  // Importante: NO usamos transform de Tailwind (hover translate) porque
  // dnd-kit pone su propio transform inline y se pisarian.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging ? '0 12px 32px rgba(91,124,245,.22), 0 0 0 2px var(--color-blue)' : '0 1px 2px rgba(26,29,38,.04)',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
         className="group lead-card bg-white border border-border rounded-[10px] mb-2 cursor-grab active:cursor-grabbing select-none"
         onClick={(e) => {
           // No abrir detalle si el click vino de un input / boton / link
           const tag = e.target.tagName;
           if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || tag === 'svg' || tag === 'path') return;
           if (e.target.closest('button, a, input, textarea, select')) return;
           onDetail?.();
         }}>
      <div className="p-2.5 flex flex-col gap-1.5">
        {/* Fila 1: nombre + score */}
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => { focusedRef.current = 'name'; }}
            onBlur={() => { focusedRef.current = null; persist('full_name', name, lead.full_name); }}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Nombre"
            className="flex-1 min-w-0 text-[13px] font-semibold text-text border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent leading-tight"
          />
          <div className="flex items-center gap-0 shrink-0">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={(e) => { e.stopPropagation(); setScore(n); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      title={`Probabilidad ${n}/3`}
                      className="bg-transparent border-0 p-0.5 cursor-pointer">
                <Flame size={12}
                       fill={(lead.score ?? 0) >= n ? '#F97316' : 'transparent'}
                       stroke={(lead.score ?? 0) >= n ? '#F97316' : '#D1D5DB'}
                       strokeWidth={1.75} />
              </button>
            ))}
          </div>
          <button onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Eliminar"
                  className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-0.5 cursor-pointer transition-opacity">
            <Trash2 size={11} />
          </button>
        </div>

        {/* Fila 2: empresa · monto */}
        <div className="flex items-center gap-2 min-w-0">
          <input
            defaultValue={lead.company_multinivel || ''}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (lead.company_multinivel || '')) onPatch?.({ company_multinivel: v || null }); }}
            placeholder="Empresa multinivel"
            className="flex-1 min-w-0 text-[11px] text-text2 border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent"
          />
          {showAmount && (
            <span className="text-[11px] font-semibold text-text tabular-nums shrink-0">
              {fmtMoney(lead.estimated_value, lead.estimated_currency)}
            </span>
          )}
        </div>

        {/* Fila 3: proximo paso (highlight azul) */}
        <div className="bg-blue-bg2 border border-blue-bg rounded-[7px] px-2 py-1 flex items-start gap-1.5">
          <ArrowRight size={11} className="text-blue shrink-0 mt-0.5" />
          <textarea
            rows={1}
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            onFocus={(e) => { focusedRef.current = 'nextStep'; e.target.rows = 3; }}
            onBlur={(e) => { focusedRef.current = null; e.target.rows = 1; persist('next_step', nextStep, lead.next_step); }}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Próximo paso…"
            className="flex-1 min-w-0 text-[11px] text-text leading-snug bg-transparent border-0 outline-none resize-none placeholder:text-text3"
          />
        </div>

        {/* Fila 4: avatars + monto inline (si vacio) + tags + WA + detalle */}
        <div className="flex items-center gap-1 mt-0.5">
          <AssigneePicker label="Dueño" valuePerson={owner} valueId={lead.owner_id}
                          options={salesTeam} disabled={!canEditOwners}
                          onChange={(uid) => onPatch?.({ owner_id: uid || null })} />
          {setter && setter.user_id !== owner?.user_id && (
            <span className="-ml-1.5 ring-2 ring-white rounded-full">
              <AssigneePicker label="Setter" valuePerson={setter} valueId={lead.setter_id}
                              options={salesTeam} disabled={!canEditOwners}
                              onChange={(uid) => onPatch?.({ setter_id: uid || null })} />
            </span>
          )}
          <div className="flex-1" />
          {!showAmount && (
            <input
              type="number" min="0" step="0.01"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              onFocus={() => { focusedRef.current = 'estimated'; }}
              onBlur={() => { focusedRef.current = null; persist('estimated_value', estimated, lead.estimated_value); }}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="$"
              className="w-12 text-[10px] text-text3 border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent text-right"
            />
          )}
          {lead.origin === 'llamada_auto' && (
            <span className="text-[8px] bg-blue-bg text-blue px-1 py-0.5 rounded font-semibold uppercase tracking-wider">auto</span>
          )}
          {lead.closed_at && (
            <span className="text-[8px] bg-green-50 text-green-700 px-1 py-0.5 rounded font-semibold uppercase tracking-wider">cerrado</span>
          )}
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noreferrer" title={`WhatsApp: ${lead.phone}`}
               onClick={(e) => e.stopPropagation()}
               onPointerDown={(e) => e.stopPropagation()}
               className="bg-green-50 text-green-600 hover:bg-green-100 rounded-[7px] w-[26px] h-[26px] flex items-center justify-center transition-colors">
              <MessageCircle size={13} />
            </a>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDetail?.(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Detalle"
                  className="text-text3 hover:text-text bg-transparent border-0 p-1 cursor-pointer">
            <MoreHorizontal size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AssigneePicker({ label, valueId, valuePerson, options, disabled, onChange }) {
  const content = valuePerson ? (
    valuePerson.avatar_url ? (
      <img src={valuePerson.avatar_url} alt={valuePerson.name} className="w-5 h-5 rounded-full object-cover" />
    ) : (
      <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[8px]"
            style={{ background: (valuePerson.color || '#5B7CF5') + '24', color: valuePerson.color || '#5B7CF5' }}>
        {valuePerson.initials || valuePerson.name?.slice(0, 2).toUpperCase()}
      </span>
    )
  ) : (
    <span className="w-5 h-5 rounded-full bg-surface2 border border-dashed border-border flex items-center justify-center text-text3 text-[8px]">?</span>
  );

  return (
    <div className={`relative ${disabled ? '' : 'cursor-pointer hover:opacity-80'}`}
         onPointerDown={(e) => e.stopPropagation()}
         onClick={(e) => e.stopPropagation()}
         title={`${label}: ${valuePerson?.name || 'Sin asignar'}`}>
      {content}
      {!disabled && (
        <select value={valueId || ''} onChange={(e) => onChange?.(e.target.value || null)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0 opacity-0 cursor-pointer" aria-label={label}>
          <option value="">Sin asignar</option>
          {options.map((tm) => <option key={tm.user_id} value={tm.user_id}>{tm.name}</option>)}
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

function fmtMoney(n, ccy = 'USD') {
  if (!n) return '';
  const symbol = ccy === 'USD' ? 'US$' : ccy === 'EUR' ? '€' : ccy === 'ARS' ? '$' : ccy === 'MXN' ? 'MX$' : '';
  if (n >= 1000) return `${symbol} ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${symbol} ${Math.round(n)}`;
}

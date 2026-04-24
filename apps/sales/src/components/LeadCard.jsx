import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flame, MessageCircle, MoreHorizontal, GripVertical, Trash2 } from 'lucide-react';

// Card compacta. Drag handle vertical a la izq, todo lo demas interactivo.
export default function LeadCard({
  lead, owner, setter, salesTeam = [], canEditOwners,
  onDetail, onPatch, onDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id, data: { type: 'lead', stage_id: lead.stage_id },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const [name, setName]         = useState(lead.full_name || '');
  const [nextStep, setNextStep] = useState(lead.next_step || '');
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

  return (
    <div ref={setNodeRef} style={style}
         className="group bg-white border border-border rounded-md mb-1.5 hover:border-blue/60 transition-colors flex">
      {/* Drag handle vertical */}
      <div {...attributes} {...listeners}
           className="w-4 flex items-center justify-center cursor-grab active:cursor-grabbing border-r border-border/40 bg-surface2/40 hover:bg-surface2"
           title="Arrastrar">
        <GripVertical size={11} className="text-text3" />
      </div>

      <div className="flex-1 min-w-0 p-2 space-y-1">
        {/* Fila 1: nombre + score + delete */}
        <div className="flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => { focusedRef.current = 'name'; }}
            onBlur={() => { focusedRef.current = null; persist('full_name', name, lead.full_name); }}
            placeholder="Nombre"
            className="flex-1 min-w-0 text-[13px] font-semibold text-text border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent"
          />
          <div className="flex items-center gap-0">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => setScore(n)}
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
          <button onClick={onDelete}
                  title="Eliminar"
                  className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-0.5 cursor-pointer transition-opacity">
            <Trash2 size={11} />
          </button>
        </div>

        {/* Fila 2: empresa */}
        <input
          value={lead.company_multinivel || ''}
          onChange={(e) => onPatch?.({ company_multinivel: e.target.value })}
          onBlur={(e) => { const v = e.target.value.trim(); if (v !== (lead.company_multinivel || '')) onPatch?.({ company_multinivel: v || null }); }}
          placeholder="Empresa multinivel"
          className="w-full text-[10px] text-text2 border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent"
        />

        {/* Fila 3: dueño + setter (solo avatar) */}
        <div className="flex items-center gap-1">
          <AssigneePicker label="Dueño" valuePerson={owner} valueId={lead.owner_id}
                          options={salesTeam} disabled={!canEditOwners}
                          onChange={(uid) => onPatch?.({ owner_id: uid || null })} />
          <AssigneePicker label="Setter" valuePerson={setter} valueId={lead.setter_id}
                          options={salesTeam} disabled={!canEditOwners}
                          onChange={(uid) => onPatch?.({ setter_id: uid || null })} />
          <div className="flex-1" />
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noreferrer" title={`WhatsApp: ${lead.phone}`}
               className="text-green-600 hover:bg-green-50 rounded p-1">
              <MessageCircle size={12} />
            </a>
          )}
          <button onClick={onDetail} title="Detalle"
                  className="text-text3 hover:text-text bg-transparent border-0 p-1 cursor-pointer">
            <MoreHorizontal size={12} />
          </button>
        </div>

        {/* Fila 4: próximo paso */}
        <textarea
          rows={1}
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          onFocus={(e) => { focusedRef.current = 'nextStep'; e.target.rows = 3; }}
          onBlur={(e) => { focusedRef.current = null; e.target.rows = 1; persist('next_step', nextStep, lead.next_step); }}
          placeholder="Próximo paso…"
          className="w-full text-[10px] text-text2 border border-border focus:border-blue rounded px-1.5 py-0.5 outline-none bg-bg resize-none"
        />

        {/* Fila 5: monto USD */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-text3 font-semibold">$</span>
          <input
            type="number" min="0" step="0.01"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            onFocus={() => { focusedRef.current = 'estimated'; }}
            onBlur={() => { focusedRef.current = null; persist('estimated_value', estimated, lead.estimated_value); }}
            placeholder="Estimado USD"
            className="flex-1 min-w-0 text-[10px] text-text border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent"
          />
        </div>

        {(lead.origin === 'llamada_auto' || lead.closed_at) && (
          <div className="flex flex-wrap gap-1">
            {lead.origin === 'llamada_auto' && (
              <span className="text-[8px] bg-blue-bg text-blue px-1 py-0.5 rounded uppercase tracking-wider font-semibold">Llamada</span>
            )}
            {lead.closed_at && (
              <span className="text-[8px] bg-green-50 text-green-700 px-1 py-0.5 rounded uppercase tracking-wider font-semibold">
                ✓ {new Date(lead.closed_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Avatar circular con dropdown encima (cuando no esta disabled).
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

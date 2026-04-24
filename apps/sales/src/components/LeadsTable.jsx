import { Flame, MessageCircle, MoreHorizontal, Trash2 } from 'lucide-react';

// Vista de tabla del CRM. Cada fila es un lead, edicion inline directa.
const CURRENCIES = ['USD', 'EUR', 'MXN', 'ARS'];

export default function LeadsTable({
  leads, stages, salesTeam, ownersByUserId, canEditOwners,
  onPatchLead, onDeleteLead, onDetail,
}) {
  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[1100px]">
          <thead className="bg-surface2 border-b border-border text-text2 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left py-2 px-2.5 font-semibold">Nombre</th>
              <th className="text-left py-2 px-2 font-semibold">Empresa</th>
              <th className="text-left py-2 px-2 font-semibold">Etapa</th>
              <th className="text-left py-2 px-2 font-semibold w-[120px]">Dueño</th>
              <th className="text-left py-2 px-2 font-semibold w-[120px]">Setter</th>
              <th className="text-center py-2 px-2 font-semibold w-[80px]">Score</th>
              <th className="text-left py-2 px-2 font-semibold w-[140px]">Estimado</th>
              <th className="text-left py-2 px-2 font-semibold">Próximo paso</th>
              <th className="w-[80px]"></th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-text3 py-8 text-[12px]">Sin leads</td></tr>
            ) : leads.map((l) => (
              <Row key={l.id}
                   lead={l}
                   stages={stages}
                   salesTeam={salesTeam}
                   owner={ownersByUserId?.[l.owner_id]}
                   setter={ownersByUserId?.[l.setter_id]}
                   canEditOwners={canEditOwners}
                   onPatch={(patch) => onPatchLead(l.id, patch)}
                   onDelete={() => onDeleteLead(l.id)}
                   onDetail={() => onDetail(l)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ lead, stages, salesTeam, owner, setter, canEditOwners, onPatch, onDelete, onDetail }) {
  const persistText = (key, current) => {
    const v = current?.trim() || null;
    if (v !== lead[key]) onPatch({ [key]: v });
  };
  const persistNum = (key, current) => {
    const num = current === '' || current == null ? null : Number(current);
    if (num !== null && Number.isNaN(num)) return;
    if (num !== lead[key]) onPatch({ [key]: num });
  };

  const waUrl = whatsappUrl(lead.phone);

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface2/40">
      {/* Nombre */}
      <td className="px-2 py-1.5">
        <input defaultValue={lead.full_name}
               onBlur={(e) => persistText('full_name', e.target.value)}
               className={inlineInput + ' font-semibold'} />
      </td>
      {/* Empresa */}
      <td className="px-2 py-1.5">
        <input defaultValue={lead.company_multinivel || ''}
               onBlur={(e) => persistText('company_multinivel', e.target.value)}
               className={inlineInput} />
      </td>
      {/* Etapa */}
      <td className="px-2 py-1.5">
        <select value={lead.stage_id || ''}
                onChange={(e) => onPatch({ stage_id: e.target.value || null })}
                className={inlineSelect}>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </td>
      {/* Dueño */}
      <td className="px-2 py-1.5">
        <AssignSelect valueId={lead.owner_id} valuePerson={owner} options={salesTeam}
                      disabled={!canEditOwners}
                      onChange={(uid) => onPatch({ owner_id: uid || null })} />
      </td>
      {/* Setter */}
      <td className="px-2 py-1.5">
        <AssignSelect valueId={lead.setter_id} valuePerson={setter} options={salesTeam}
                      disabled={!canEditOwners}
                      onChange={(uid) => onPatch({ setter_id: uid || null })} />
      </td>
      {/* Score */}
      <td className="px-2 py-1.5 text-center">
        <div className="flex items-center justify-center gap-0">
          {[1, 2, 3].map((n) => (
            <button key={n} onClick={() => onPatch({ score: lead.score === n ? null : n })}
                    title={`${n}/3`}
                    className="bg-transparent border-0 p-0.5 cursor-pointer">
              <Flame size={12}
                     fill={(lead.score ?? 0) >= n ? '#F97316' : 'transparent'}
                     stroke={(lead.score ?? 0) >= n ? '#F97316' : '#D1D5DB'}
                     strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </td>
      {/* Estimado */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <select value={lead.estimated_currency || 'USD'}
                  onChange={(e) => onPatch({ estimated_currency: e.target.value })}
                  className="text-[10px] text-text2 border border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-bg cursor-pointer">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" min="0" step="0.01"
                 defaultValue={lead.estimated_value ?? ''}
                 onBlur={(e) => persistNum('estimated_value', e.target.value)}
                 className={inlineInput + ' text-right w-[80px]'} />
        </div>
      </td>
      {/* Próximo paso */}
      <td className="px-2 py-1.5">
        <input defaultValue={lead.next_step || ''}
               onBlur={(e) => persistText('next_step', e.target.value)}
               className={inlineInput} placeholder="…" />
      </td>
      {/* Acciones */}
      <td className="px-2 py-1.5">
        <div className="flex items-center justify-end gap-1">
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noreferrer" title="WhatsApp"
               className="text-green-600 hover:bg-green-50 rounded p-1">
              <MessageCircle size={13} />
            </a>
          )}
          <button onClick={onDetail} title="Detalle"
                  className="text-text3 hover:text-text bg-transparent border-0 p-1 cursor-pointer">
            <MoreHorizontal size={13} />
          </button>
          <button onClick={() => { if (confirm(`¿Eliminar a ${lead.full_name}?`)) onDelete(); }}
                  title="Eliminar"
                  className="text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer">
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AssignSelect({ valueId, valuePerson, options, disabled, onChange }) {
  return (
    <div className={`relative flex items-center gap-1.5 px-1.5 py-1 rounded border border-transparent ${disabled ? '' : 'hover:border-border hover:bg-surface2/70 cursor-pointer'}`}>
      {valuePerson ? (
        valuePerson.avatar_url ? (
          <img src={valuePerson.avatar_url} alt={valuePerson.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[8px] shrink-0"
                style={{ background: (valuePerson.color || '#5B7CF5') + '24', color: valuePerson.color || '#5B7CF5' }}>
            {valuePerson.initials || valuePerson.name?.slice(0, 2).toUpperCase()}
          </span>
        )
      ) : (
        <span className="w-5 h-5 rounded-full bg-surface2 border border-dashed border-border flex items-center justify-center text-text3 text-[8px] shrink-0">?</span>
      )}
      <span className="text-[11px] text-text2 truncate">{valuePerson?.name || <em className="text-text3">—</em>}</span>
      {!disabled && (
        <select value={valueId || ''} onChange={(e) => onChange?.(e.target.value || null)}
                className="absolute inset-0 opacity-0 cursor-pointer">
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

const inlineInput = 'w-full border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 text-[12px] outline-none bg-transparent';
const inlineSelect = 'w-full text-[11px] border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none bg-transparent cursor-pointer';

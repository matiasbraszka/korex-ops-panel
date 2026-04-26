import { useEffect, useMemo, useState } from 'react';
import { Flame, MessageCircle, MoreHorizontal, Trash2, ArrowRight, ChevronLeft, ChevronRight, Instagram } from 'lucide-react';

// Tabla plana (sin agrupar por etapa). El estado del pipeline se ve y se
// edita en una columna "Estado". Paginada de a 20 leads para no saturar.
const PAGE_SIZE = 20;
const COLS = '1.6fr 1.3fr 130px 60px 60px 60px 100px 1.4fr 90px';

export default function LeadsTable({
  leads, stages, salesTeam, ownersByUserId, canEditOwners,
  onPatchLead, onDeleteLead, onDetail,
}) {
  const stagesById = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s])),
    [stages],
  );

  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  // Si filtran y la pagina actual queda fuera, volver a la 1.
  useEffect(() => { if (page > totalPages) setPage(1); }, [leads.length, totalPages, page]);

  const start = (page - 1) * PAGE_SIZE;
  const visible = leads.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-2 overflow-x-auto">
      {leads.length === 0 ? (
        <div className="text-center text-text3 py-12 text-[12px]">Sin leads</div>
      ) : (
        <div className="min-w-[1080px]">
          <div className="bg-white border border-border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="bg-surface2 border-b border-border text-text2 text-[10px] uppercase tracking-wider grid items-center"
                 style={{ gridTemplateColumns: COLS }}>
              <span className="px-2.5 py-2 font-semibold">Lead</span>
              <span className="px-2 py-2 font-semibold">Empresa</span>
              <span className="px-2 py-2 font-semibold">Estado</span>
              <span className="px-2 py-2 font-semibold text-center">Dueño</span>
              <span className="px-2 py-2 font-semibold text-center">Setter</span>
              <span className="px-2 py-2 font-semibold text-center">Score</span>
              <span className="px-2 py-2 font-semibold text-right">Estimado</span>
              <span className="px-2 py-2 font-semibold">Próximo paso</span>
              <span className="px-2 py-2 font-semibold text-right">Acción</span>
            </div>

            {visible.map((l) => (
              <Row key={l.id}
                   lead={l}
                   stage={stagesById[l.stage_id]}
                   stages={stages}
                   salesTeam={salesTeam}
                   owner={ownersByUserId?.[l.owner_id]}
                   setter={ownersByUserId?.[l.setter_id]}
                   canEditOwners={canEditOwners}
                   onPatch={(patch) => onPatchLead(l.id, patch)}
                   onDelete={() => onDeleteLead(l.id)}
                   onDetail={() => onDetail(l)} />
            ))}
          </div>

          {/* Paginacion */}
          {leads.length > PAGE_SIZE && (
            <Pagination page={page} totalPages={totalPages} total={leads.length}
                        start={start} pageSize={PAGE_SIZE} onPage={setPage} />
          )}
        </div>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, total, start, pageSize, onPage }) {
  const from = start + 1;
  const to = Math.min(start + pageSize, total);
  return (
    <div className="flex items-center justify-between mt-3 px-1 text-[11px]">
      <span className="text-text3 tabular-nums">
        Mostrando {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-white text-text2 text-[11px] font-medium hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          <ChevronLeft size={12} /> Anterior
        </button>
        {pageNumbers(page, totalPages).map((n, i) => (
          n === '…' ? (
            <span key={`e${i}`} className="px-1 text-text3">…</span>
          ) : (
            <button key={n} onClick={() => onPage(n)}
                    className="min-w-[28px] h-[26px] rounded-md text-[11px] font-bold cursor-pointer border"
                    style={{
                      background: n === page ? 'var(--color-blue)' : 'white',
                      color: n === page ? 'white' : 'var(--color-text2)',
                      borderColor: n === page ? 'var(--color-blue)' : 'var(--color-border)',
                    }}>
              {n}
            </button>
          )
        ))}
        <button onClick={() => onPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-white text-text2 text-[11px] font-medium hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          Siguiente <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

// Devuelve un array tipo [1,2,3,'…',7] para listar paginas con elipsis.
function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set([1, total, current - 1, current, current + 1]);
  const arr = [...out].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const result = [];
  arr.forEach((n, i) => {
    if (i > 0 && n - arr[i - 1] > 1) result.push('…');
    result.push(n);
  });
  return result;
}

function Row({ lead, stage, stages, salesTeam, owner, setter, canEditOwners, onPatch, onDelete, onDetail }) {
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
  const igUrl = waUrl ? null : instagramUrl(lead.instagram);
  const stageColor = stage?.color || '#9CA3AF';

  return (
    <div className="border-b border-border last:border-b-0 hover:bg-blue-bg2/40 transition-colors grid items-center text-[12px] cursor-pointer group"
         style={{ gridTemplateColumns: COLS }}
         onClick={(e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'A' && e.target.tagName !== 'BUTTON') onDetail?.(); }}>
      {/* Lead */}
      <div className="px-2.5 py-1.5 flex items-center gap-2 min-w-0">
        <span className="w-1 h-7 rounded-full shrink-0" style={{ background: stageColor }} />
        <input defaultValue={lead.full_name}
               onClick={(e) => e.stopPropagation()}
               onBlur={(e) => persistText('full_name', e.target.value)}
               className={inlineInput + ' font-semibold'} />
      </div>
      {/* Empresa */}
      <div className="px-2 py-1.5">
        <input defaultValue={lead.company_multinivel || ''}
               onClick={(e) => e.stopPropagation()}
               onBlur={(e) => persistText('company_multinivel', e.target.value)}
               className={inlineInput} />
      </div>
      {/* Estado (selector inline con dot color) */}
      <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <StagePicker stage={stage} stages={stages}
                     onChange={(stageId) => stageId !== lead.stage_id && onPatch({ stage_id: stageId })} />
      </div>
      {/* Dueño */}
      <div className="px-2 py-1.5 text-center">
        <AssignAvatar valueId={lead.owner_id} valuePerson={owner} options={salesTeam}
                      label="Dueño" disabled={!canEditOwners}
                      onChange={(uid) => onPatch({ owner_id: uid || null })} />
      </div>
      {/* Setter */}
      <div className="px-2 py-1.5 text-center">
        <AssignAvatar valueId={lead.setter_id} valuePerson={setter} options={salesTeam}
                      label="Setter" disabled={!canEditOwners}
                      onChange={(uid) => onPatch({ setter_id: uid || null })} />
      </div>
      {/* Score */}
      <div className="px-2 py-1.5 text-center">
        <div className="flex items-center justify-center gap-0">
          {[1, 2, 3].map((n) => (
            <button key={n} onClick={(e) => { e.stopPropagation(); onPatch({ score: lead.score === n ? null : n }); }}
                    title={`${n}/3`}
                    className="bg-transparent border-0 p-0.5 cursor-pointer">
              <Flame size={12}
                     fill={(lead.score ?? 0) >= n ? '#F97316' : 'transparent'}
                     stroke={(lead.score ?? 0) >= n ? '#F97316' : '#D1D5DB'}
                     strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>
      {/* Estimado USD */}
      <div className="px-2 py-1.5 flex items-center gap-0.5 justify-end">
        <span className="text-[11px] text-text3">$</span>
        <input type="number" min="0" step="0.01"
               defaultValue={lead.estimated_value ?? ''}
               onClick={(e) => e.stopPropagation()}
               onBlur={(e) => persistNum('estimated_value', e.target.value)}
               className={inlineInput + ' text-right tabular-nums'} placeholder="0" />
      </div>
      {/* Próximo paso */}
      <div className="px-2 py-1.5 flex items-center gap-1.5 min-w-0">
        <ArrowRight size={11} className="text-blue shrink-0" />
        <input defaultValue={lead.next_step || ''}
               onClick={(e) => e.stopPropagation()}
               onBlur={(e) => persistText('next_step', e.target.value)}
               className={inlineInput + ' text-text2'} placeholder="…" />
      </div>
      {/* Acciones */}
      <div className="px-2 py-1.5 flex items-center justify-end gap-1">
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" title="WhatsApp"
             onClick={(e) => e.stopPropagation()}
             className="text-green-600 hover:bg-green-50 rounded p-1">
            <MessageCircle size={13} />
          </a>
        )}
        {igUrl && (
          <a href={igUrl} target="_blank" rel="noreferrer" title="Instagram"
             onClick={(e) => e.stopPropagation()}
             className="text-pink-600 hover:bg-pink-50 rounded p-1">
            <Instagram size={13} />
          </a>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDetail?.(); }} title="Detalle"
                className="text-text3 hover:text-text bg-transparent border-0 p-1 cursor-pointer">
          <MoreHorizontal size={13} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar a ${lead.full_name}?`)) onDelete(); }}
                title="Eliminar"
                className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer transition-opacity">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// Picker de etapa: pill con dot color + nombre. Se edita con un <select>
// nativo invisible encima (mismo truco que AssignAvatar).
function StagePicker({ stage, stages, onChange }) {
  const color = stage?.color || '#9CA3AF';
  return (
    <div className="relative inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-white hover:bg-surface2 cursor-pointer min-w-0 max-w-full"
         title={stage?.name || 'Sin etapa'}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[11.5px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>
        {stage?.name || 'Sin etapa'}
      </span>
      <select value={stage?.id || ''}
              onChange={(e) => onChange?.(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Estado del lead">
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}

function AssignAvatar({ valueId, valuePerson, options, label, disabled, onChange }) {
  const content = valuePerson ? (
    valuePerson.avatar_url ? (
      <img src={valuePerson.avatar_url} alt={valuePerson.name} className="w-6 h-6 rounded-full object-cover mx-auto" />
    ) : (
      <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[9px] mx-auto"
            style={{ background: (valuePerson.color || '#5B7CF5') + '24', color: valuePerson.color || '#5B7CF5' }}>
        {valuePerson.initials || valuePerson.name?.slice(0, 2).toUpperCase()}
      </span>
    )
  ) : (
    <span className="w-6 h-6 rounded-full bg-surface2 border border-dashed border-border flex items-center justify-center text-text3 text-[9px] mx-auto">?</span>
  );

  return (
    <div className={`relative inline-block ${disabled ? '' : 'cursor-pointer hover:opacity-80'}`}
         title={`${label}: ${valuePerson?.name || 'Sin asignar'}`}
         onClick={(e) => e.stopPropagation()}>
      {content}
      {!disabled && (
        <select value={valueId || ''} onChange={(e) => onChange?.(e.target.value || null)}
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

function instagramUrl(ig) {
  if (!ig) return null;
  const v = String(ig).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '').replace(/^instagram\.com\//i, '');
  return `https://instagram.com/${handle}`;
}

const inlineInput = 'w-full border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 text-[12px] outline-none bg-transparent';

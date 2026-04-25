import { useState, useEffect, useMemo } from 'react';
import { Flame, MessageCircle, MoreHorizontal, Trash2, ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 20;

// Tabla agrupada por etapa con secciones colapsables y paginación de 20 leads/pág.
export default function LeadsTable({
  leads, stages, salesTeam, ownersByUserId, canEditOwners,
  onPatchLead, onDeleteLead, onDetail,
}) {
  const totalLeads = leads.length;
  const totalPages = Math.max(1, Math.ceil(totalLeads / PAGE_SIZE));

  const [page, setPage] = useState(1);
  // Reset a página 1 cuando cambia el conjunto de leads (filtros aplicados)
  useEffect(() => { setPage(1); }, [totalLeads]);
  // Si por alguna razón page queda fuera de rango, corregir
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  // Slice paginado preservando el orden recibido
  const pagedLeads = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return leads.slice(start, start + PAGE_SIZE);
  }, [leads, page]);

  // Agrupar por etapa preservando orden
  const grouped = stages
    .map((s) => ({ stage: s, rows: pagedLeads.filter((l) => l.stage_id === s.id) }))
    .filter((g) => g.rows.length > 0);

  const [collapsed, setCollapsed] = useState({});
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const fromIdx = totalLeads === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIdx = Math.min(page * PAGE_SIZE, totalLeads);

  return (
    <div className="space-y-3 overflow-x-auto">
      {grouped.length === 0 ? (
        <div className="text-center text-text3 py-12 text-[12px]">Sin leads</div>
      ) : grouped.map((g) => {
        const total = g.rows.reduce((s, r) => s + (Number(r.estimated_value) || 0), 0);
        const isCollapsed = !!collapsed[g.stage.id];
        return (
          <div key={g.stage.id} className="min-w-[1000px]">
            {/* Header de grupo colapsable */}
            <button onClick={() => toggle(g.stage.id)}
                    className="w-full flex items-center gap-2 px-1 py-1.5 mb-1 bg-transparent border-0 cursor-pointer text-left">
              <ChevronDown size={12}
                           className="text-text3 transition-transform shrink-0"
                           style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)' }} />
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.stage.color }} />
              <span className="text-[11px] font-bold uppercase tracking-wider">{g.stage.name}</span>
              <span className="text-[10.5px] text-text3 font-medium">
                {g.rows.length} {g.rows.length === 1 ? 'lead' : 'leads'}
                {total > 0 && <> · {fmtMoney(total)}</>}
              </span>
              <span className="flex-1" />
              {isCollapsed && (
                <span className="text-[10px] text-text3">
                  {g.rows.length} {g.rows.length === 1 ? 'lead' : 'leads'} ocultos
                </span>
              )}
            </button>

            {!isCollapsed && (
            <div className="bg-white border border-border rounded-lg overflow-hidden">
              {/* Column headers solo en el primer grupo */}
              <div className="bg-surface2 border-b border-border text-text2 text-[10px] uppercase tracking-wider grid items-center"
                   style={{ gridTemplateColumns: '1.8fr 1.4fr 60px 60px 60px 100px 1.6fr 90px' }}>
                <span className="px-2.5 py-2 font-semibold">Lead</span>
                <span className="px-2 py-2 font-semibold">Empresa</span>
                <span className="px-2 py-2 font-semibold text-center">Dueño</span>
                <span className="px-2 py-2 font-semibold text-center">Setter</span>
                <span className="px-2 py-2 font-semibold text-center">Score</span>
                <span className="px-2 py-2 font-semibold text-right">Estimado</span>
                <span className="px-2 py-2 font-semibold">Próximo paso</span>
                <span className="px-2 py-2 font-semibold text-right">Acción</span>
              </div>

              {g.rows.map((l) => (
                <Row key={l.id}
                     lead={l}
                     stage={g.stage}
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
            )}
          </div>
        );
      })}

      {/* Footer de paginación */}
      {totalLeads > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          fromIdx={fromIdx}
          toIdx={toIdx}
          totalLeads={totalLeads}
          onChange={setPage}
        />
      )}
    </div>
  );
}

// Paginación: 'Mostrando X-Y de Z' + Anterior · 1 2 3 … · Siguiente
function Pagination({ page, totalPages, fromIdx, toIdx, totalLeads, onChange }) {
  // Generar lista de páginas con elipsis cuando hay muchas
  const pages = pageRange(page, totalPages);

  return (
    <div className="flex items-center justify-between flex-wrap gap-2 py-3 px-1">
      <div className="text-[11px] text-text3">
        Mostrando <span className="text-text2 font-semibold">{fromIdx}</span>–
        <span className="text-text2 font-semibold">{toIdx}</span> de{' '}
        <span className="text-text2 font-semibold">{totalLeads}</span>
        {' '}{totalLeads === 1 ? 'lead' : 'leads'}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="bg-white border border-border rounded-md px-2.5 py-1 text-[11.5px] font-medium text-text2 hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
          <ChevronLeft size={13} /> Anterior
        </button>

        {pages.map((p, i) => p === '…' ? (
          <span key={'e' + i} className="px-1 text-text3 text-[11px]">…</span>
        ) : (
          <button key={p}
                  onClick={() => onChange(p)}
                  className={`min-w-[28px] py-1 px-2 rounded-md text-[11.5px] font-semibold ${
                    p === page
                      ? 'bg-blue text-white'
                      : 'bg-white border border-border text-text2 hover:bg-surface2'
                  }`}>
            {p}
          </button>
        ))}

        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="bg-white border border-border rounded-md px-2.5 py-1 text-[11.5px] font-medium text-text2 hover:bg-surface2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
          Siguiente <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// Devuelve [1, 2, '…', current-1, current, current+1, '…', last] o variantes
function pageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const arr = [...out].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    result.push(arr[i]);
    if (i < arr.length - 1 && arr[i + 1] - arr[i] > 1) result.push('…');
  }
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

  return (
    <div className="border-b border-border last:border-b-0 hover:bg-blue-bg2/40 transition-colors grid items-center text-[12px] cursor-pointer group"
         style={{ gridTemplateColumns: '1.8fr 1.4fr 60px 60px 60px 100px 1.6fr 90px' }}
         onClick={(e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'A' && e.target.tagName !== 'BUTTON') onDetail?.(); }}>
      {/* Lead — color bar + nombre */}
      <div className="px-2.5 py-1.5 flex items-center gap-2 min-w-0">
        <span className="w-1 h-7 rounded-full shrink-0" style={{ background: stage.color }} />
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

function fmtMoney(n) {
  if (!n) return 'US$ 0';
  if (n >= 1000) return `US$ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `US$ ${Math.round(n)}`;
}

const inlineInput = 'w-full border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 text-[12px] outline-none bg-transparent';

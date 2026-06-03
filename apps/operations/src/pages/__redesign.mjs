import fs from 'fs';
const path = 'ClientDetail.jsx';
let s = fs.readFileSync(path, 'utf8');

const oldStart = '      <button className="inline-flex items-center gap-1.5 text-text2 text-[13px] cursor-pointer mb-4 py-1.5 px-2.5 rounded-md bg-transparent border-none font-sans hover:text-blue hover:bg-blue-bg" onClick={() => setSelectedId(null)}>';
const oldEndAnchor = '      </div>\n\n      {/* Ver roadmap';
const idxStart = s.indexOf(oldStart);
const idxEnd = s.indexOf(oldEndAnchor);
console.log('idxStart', idxStart, 'idxEnd', idxEnd);
if (idxStart < 0 || idxEnd < 0) { console.log('NOT FOUND'); process.exit(1); }

const newHeader = `      <button className="inline-flex items-center gap-1.5 text-text2 text-[13px] cursor-pointer mb-4 py-1.5 px-2.5 rounded-md bg-transparent border-none font-sans hover:text-blue hover:bg-blue-bg" onClick={() => setSelectedId(null)}>
        <ArrowLeft size={14} /> Clientes
      </button>

      {/* Header card */}
      <div className="bg-white border border-[#E2E5EB] rounded-xl px-5 py-[18px] mb-4 shadow-sm max-md:p-4">
        <div className="flex items-start gap-4 max-md:gap-3">
          {c.avatarUrl ? (
            <img src={c.avatarUrl} alt={c.name} className="w-14 h-14 rounded-full object-cover shrink-0 max-md:w-12 max-md:h-12" />
          ) : (
            <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-[15px] shrink-0 max-md:w-12 max-md:h-12" style={{ background: c.color + '20', color: c.color }}>{initials(c.name)}</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[21px] font-bold tracking-tight leading-tight max-md:text-[18px]" style={{ color: '#1A1D26' }}>{c.name}</div>
              <span
                ref={el => getDropdownRef('client-prio').current = el}
                className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold cursor-pointer hover:opacity-80"
                style={{ background: pcfg.color + '15', color: pcfg.color }}
                onClick={() => setOpenDropdown('client-prio')}
              >{pcfg.label}</span>
              <Dropdown
                open={openDropdown === 'client-prio'}
                onClose={() => setOpenDropdown(null)}
                anchorRef={getDropdownRef('client-prio')}
                items={Object.entries(getAllPriorityLabels()).map(([k, v]) => ({ label: v.label, iconColor: v.color, icon: '●', onClick: () => { updateClient(c.id, { priority: parseInt(k) }); setOpenDropdown(null); } }))}
              />
              <StatusPill text={pill.text} pillClass={pill.pillClass} />
            </div>
            <div className="text-[13px] font-medium mt-0.5 max-md:text-[12px]" style={{ color: '#6B7280' }}>{c.company}</div>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap text-[12px] max-md:gap-1.5 max-md:mt-2 max-md:text-[11px]" style={{ color: '#6B7280' }}>
              <span className="inline-flex items-center gap-1.5"><Inbox size={14} className="text-[#9CA3AF]" />{c.service || '—'}</span>
              <span className="text-[#D0D5DD]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} className="text-[#9CA3AF]" />
                Ingreso{' '}
                {editingStartDate ? (
                  <input type="date" className="border border-blue rounded py-[2px] px-1.5 text-xs font-sans outline-none" defaultValue={c.startDate || ''} autoFocus onBlur={(e) => handleInlineStartDate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
                ) : (
                  <span className="cursor-pointer py-[1px] px-1 rounded hover:bg-surface2" onClick={() => setEditingStartDate(true)}>{fmtDate(c.startDate)}</span>
                )}
                <span className="text-[#D0D5DD] mx-1">·</span> Dia {days}
              </span>
              {ct > 0 && (
                <>
                  <span className="text-[#D0D5DD]">·</span>
                  <span className="inline-flex items-center gap-1.5 text-blue"><User size={14} />{ct} tareas pendientes</span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 ml-auto shrink-0">
            <button className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-[#E2E5EB] bg-white text-text2 text-xs font-medium cursor-pointer font-sans hover:bg-surface2 hover:text-text max-md:py-1 max-md:px-2 max-md:text-[11px]" onClick={openEditModal}><Pencil size={13} /> Editar</button>
            {canDeleteClient && (
              <button
                className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-red-200 bg-white text-red-500 text-xs font-medium cursor-pointer font-sans hover:bg-red-50 hover:border-red-300 max-md:py-1 max-md:px-2 max-md:text-[11px]"
                onClick={() => { setDeleteClientConfirmName(''); setDeleteClientModal(true); }}
                title="Eliminar cliente y todas sus tareas"
              ><Trash2 size={13} /> Eliminar</button>
            )}
          </div>
        </div>

        <div className="mt-[18px]">
          <div className="flex justify-between text-[11px] font-medium" style={{ color: '#6B7280' }}>
            <span>Progreso del proyecto</span>
            <span><b className="font-bold" style={{ color: '#1A1D26' }}>{pct}%</b> · {doneRoadmap}/{totalRoadmap} tareas</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden mt-1.5" style={{ background: '#F0F2F5' }}>
            <div className="h-full rounded-full transition-all" style={{ width: pct + '%', background: '#5B7CF5' }} />
          </div>
        </div>
      </div>
`;

// Also remove the standalone Ver Roadmap CTA button. It ends right before the `{(() => { // En el detalle del cliente`
const ctaEndAnchor = "      {(() => {\n        // En el detalle";
const ctaEndIdx = s.indexOf(ctaEndAnchor, idxEnd);
console.log('ctaEndIdx', ctaEndIdx);
if (ctaEndIdx < 0) { console.log('CTA end NOT FOUND'); process.exit(1); }

const newS = s.slice(0, idxStart) + newHeader + '\n' + s.slice(ctaEndIdx);
fs.writeFileSync(path, newS, 'utf8');
console.log('OK, written', newS.length, 'chars');

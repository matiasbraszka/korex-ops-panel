import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fmtDate, today } from '../utils/helpers';
import { sbFetch } from '../utils/supabase';

export default function InformePage() {
  const { clients, briefing, reportFeedbacks, setReportFeedbacks, taskProposals, setTaskProposals, currentUser, createTask, updateTask, tasks } = useApp();
  const [feedbackText, setFeedbackText] = useState('');
  const [reportExpanded, setReportExpanded] = useState(true);

  const pending = taskProposals.filter(p => p.approval === 'pending');
  const stored = briefing;

  const approveProposal = async (id) => {
    const p = taskProposals.find(x => x.id === id);
    if (!p) return;
    if (p.type === 'create') {
      const t = createTask(p.title, p.client_id, p.assignee || '', p.priority || 'normal', p.status || 'backlog', p.notes || '', p.step_idx);
      if (t && p.phase) updateTask(t.id, { phase: p.phase });
    } else if (p.type === 'complete') {
      const t = tasks.find(x => x.id === p.task_id);
      if (t) updateTask(t.id, { status: 'done' });
    } else if (p.type === 'update') {
      const t = tasks.find(x => x.id === p.task_id);
      if (t) {
        const updates = {};
        if (p.status) updates.status = p.status;
        if (p.priority) updates.priority = p.priority;
        if (p.assignee) updates.assignee = p.assignee;
        if (p.title) updates.title = p.title;
        updateTask(t.id, updates);
      }
    }
    setTaskProposals(prev => prev.map(x => x.id === id ? { ...x, approval: 'approved' } : x));
    await sbFetch('task_proposals?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ approval: 'approved' }) });
  };

  const rejectProposal = async (id) => {
    setTaskProposals(prev => prev.map(x => x.id === id ? { ...x, approval: 'rejected' } : x));
    await sbFetch('task_proposals?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ approval: 'rejected' }) });
  };

  const submitReportFeedback = async () => {
    if (!feedbackText.trim()) return;
    const fb = {
      id: 'fb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      briefing_date: briefing?.date || today(),
      feedback: feedbackText.trim(),
      created_by: currentUser?.name || 'Usuario'
    };
    const ok = await sbFetch('report_feedback', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(fb)
    });
    if (ok) {
      setReportFeedbacks(prev => [...prev, fb]);
      setFeedbackText('');
    }
  };

  // Robust markdown renderer
  const renderMarkdown = (text) => {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let inTable = false;
    let tableHeaderDone = false;
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Table row detection
      const isTableRow = /^\|(.+)\|$/.test(line.trim());
      const isSeparator = /^\|[\s\-:|]+\|$/.test(line.trim());

      if (isTableRow && !isSeparator) {
        if (!inTable) {
          if (inList) { html += '</ul>'; inList = false; }
          html += '<table class="report-table"><thead>';
          inTable = true;
          tableHeaderDone = false;
        }
        const cells = line.split('|').filter(c => c !== '');
        const cellTag = !tableHeaderDone ? 'th' : 'td';
        if (tableHeaderDone && !html.includes('<tbody>')) html += '<tbody>';
        html += '<tr>' + cells.map(c => `<${cellTag}>${formatInline(c.trim())}</${cellTag}>`).join('') + '</tr>';
        continue;
      }

      if (isSeparator && inTable) {
        tableHeaderDone = true;
        html += '</thead>';
        continue;
      }

      if (inTable && !isTableRow && !isSeparator) {
        html += '</tbody></table>';
        inTable = false;
        tableHeaderDone = false;
      }

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<hr class="my-3 border-t border-gray-200">';
        continue;
      }

      // Headers
      if (/^### (.+)$/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h3 class="text-[13px] font-bold mt-4 mb-1.5 text-gray-800">' + formatInline(line.replace(/^### /, '')) + '</h3>';
        continue;
      }
      if (/^## (.+)$/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h2 class="text-[15px] font-bold mt-5 mb-2 text-blue-600">' + formatInline(line.replace(/^## /, '')) + '</h2>';
        continue;
      }
      if (/^# (.+)$/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<h1 class="text-lg font-bold mt-5 mb-2 text-gray-900">' + formatInline(line.replace(/^# /, '')) + '</h1>';
        continue;
      }

      // Bullet points (- or *)
      if (/^\s*[-*] (.+)$/.test(line)) {
        const match = line.match(/^\s*[-*] (.+)$/);
        if (!inList) { html += '<ul class="list-disc pl-5 my-1 space-y-0.5">'; inList = true; }
        html += '<li class="text-[13px] leading-relaxed text-gray-700">' + formatInline(match[1]) + '</li>';
        continue;
      }

      // Numbered lists
      if (/^\s*\d+\.\s+(.+)$/.test(line)) {
        const match = line.match(/^\s*\d+\.\s+(.+)$/);
        if (inList) { html += '</ul>'; inList = false; }
        html += '<div class="text-[13px] leading-relaxed text-gray-700 pl-2 my-0.5">' + formatInline(line) + '</div>';
        continue;
      }

      // Close list if we get a non-list line
      if (inList) { html += '</ul>'; inList = false; }

      // Empty line
      if (line.trim() === '') {
        html += '<div class="h-2"></div>';
        continue;
      }

      // Regular paragraph
      html += '<p class="text-[13px] leading-relaxed text-gray-700 my-0.5">' + formatInline(line) + '</p>';
    }

    if (inList) html += '</ul>';
    if (inTable) html += '</tbody></table>';

    return html;
  };

  // Inline formatting: bold, italic, emoji-safe
  const formatInline = (text) => {
    if (!text) return '';
    let s = text;
    // Escape HTML but preserve our generated tags
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Bold: **text** or *text* (Slack style bold)
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Slack bold: *text* (only when surrounded by spaces or start/end)
    s = s.replace(/(^|\s)\*([^*\n]+?)\*(\s|$|[.,;:!?])/g, '$1<strong>$2</strong>$3');
    // Italic: _text_
    s = s.replace(/(^|\s)_([^_\n]+?)_(\s|$|[.,;:!?])/g, '$1<em>$2</em>$3');
    // Inline code: `text`
    s = s.replace(/`([^`]+?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs text-gray-800 font-mono">$1</code>');
    return s;
  };

  const formatDate = () => {
    if (!stored?.date) return '';
    try {
      return new Date(stored.date + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch { return stored.date; }
  };

  return (
    <div>
      {/* Two-column layout: Report left, Suggestions right — stacks on mobile */}
      <div className={`grid gap-5 max-md:grid-cols-1 max-md:gap-3 ${pending.length > 0 ? 'grid-cols-[1fr_280px]' : 'grid-cols-1'}`}>

        {/* Left column: Report */}
        <div>
          {stored && stored.text ? (
            <div className="bg-white border border-gray-200 rounded-xl py-6 px-7 max-md:py-4 max-md:px-4 max-md:rounded-lg">
              <div
                className="flex items-center gap-2.5 pb-3.5 border-b border-gray-100 cursor-pointer select-none"
                onClick={() => setReportExpanded(prev => !prev)}
              >
                <span className={`text-gray-400 text-xs transition-transform duration-200 ${reportExpanded ? '' : '-rotate-90'}`}>{'\u25BC'}</span>
                <span className="bg-blue-600 text-white text-[10px] font-bold py-[3px] px-2.5 rounded-full tracking-wide uppercase">Informe diario</span>
                <span className="text-sm text-gray-500 font-medium">{formatDate()}</span>
                {!reportExpanded && <span className="text-[11px] text-gray-400 italic">Click para expandir</span>}
                <span className="text-[11px] text-gray-400 ml-auto">{stored.source || 'ops-agent'}</span>
              </div>
              {reportExpanded && (
                <div className="mt-4" dangerouslySetInnerHTML={{ __html: renderMarkdown(stored.text) }} />
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl py-6 px-7">
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">{'\uD83D\uDCCB'}</div>
                <div className="text-sm font-semibold mb-1.5">Sin informe disponible</div>
                <div className="text-xs">El agente enviará el próximo informe automáticamente cada día.</div>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Suggestions (only if pending) */}
        {pending.length > 0 && (
          <div className="sticky top-[76px] self-start max-h-[calc(100vh-100px)] overflow-y-auto max-md:static max-md:max-h-none">
            <div className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
              {'\u26A1'} Sugerencias ({pending.length})
            </div>
            <div className="space-y-1.5">
              {pending.map(p => {
                const client = clients.find(c => c.id === p.client_id);
                const clientName = client ? client.name : '\u2014';
                const typeLabel = p.type === 'create' ? 'CREAR' : p.type === 'complete' ? 'COMPLETAR' : 'ACTUALIZAR';
                const typeColor = p.type === 'create' ? '#22C55E' : p.type === 'complete' ? '#8B5CF6' : '#3B82F6';
                const typeBg = p.type === 'create' ? '#F0FDF4' : p.type === 'complete' ? '#FAF5FF' : '#EFF6FF';
                const phaseLabel = p.phase ? p.phase.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;

                return (
                  <div key={p.id} className="bg-white border border-gray-200 rounded-lg px-2.5 py-2" style={{ borderLeftWidth: 3, borderLeftColor: typeColor }}>
                    <div className="text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5" style={{ color: typeColor }}>{typeLabel}</div>
                    <div className="text-[12px] font-semibold leading-tight mb-1 text-gray-800">{p.title || '\u2014'}</div>
                    <div className="flex items-center gap-1 flex-wrap mb-1">
                      <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-[1px] rounded">{clientName}</span>
                      {p.assignee && <span className="text-[9px] text-gray-400">{'\u2192'} {p.assignee}</span>}
                      {phaseLabel && <span className="text-[9px] px-1.5 py-[1px] rounded" style={{ background: typeBg, color: typeColor }}>{phaseLabel}</span>}
                    </div>
                    {p.reason && <div className="text-[10px] italic text-gray-400 leading-snug mb-1.5 line-clamp-2">{p.reason}</div>}
                    <div className="flex gap-1">
                      <button className="py-0.5 px-2 rounded text-[10px] font-semibold cursor-pointer font-sans bg-green-500 text-white border-none hover:bg-green-600" onClick={() => approveProposal(p.id)}>{'\u2713'}</button>
                      <button className="py-0.5 px-2 rounded text-[10px] font-semibold cursor-pointer font-sans bg-transparent text-gray-400 border border-gray-200 hover:text-red-500 hover:border-red-300" onClick={() => rejectProposal(p.id)}>{'\u2715'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Feedback section — below the report */}
      <div className="bg-white border border-gray-200 rounded-xl py-5 px-6 mt-5 max-md:py-4 max-md:px-4 max-md:mt-3 max-md:rounded-lg">
        <div className="text-sm font-semibold mb-1 text-gray-800">Feedback sobre el informe</div>
        <div className="text-[11px] text-gray-400 mb-3">Deja correcciones o contexto adicional. La IA lo usará para mejorar los próximos informes.</div>
        <div className="flex gap-2">
          <textarea
            className="flex-1 border border-gray-200 rounded-lg py-2.5 px-3.5 text-xs font-sans resize-y min-h-[60px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
            placeholder="Ej: 'Matias ya reviso lo de Sergio, esta listo' o 'La tarea de Victor ya se resolvio ayer'"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
          />
          <button className="self-end py-2 px-4 rounded-lg border-none bg-blue-600 text-white text-[13px] font-medium cursor-pointer font-sans hover:bg-blue-700" onClick={submitReportFeedback}>Enviar</button>
        </div>
        {reportFeedbacks.length > 0 && (
          <div className="mt-3.5">
            {[...reportFeedbacks].reverse().slice(0, 10).map((f, i) => (
              <div key={i} className="flex gap-2.5 py-2 border-t border-gray-100 text-xs">
                <div>
                  <div className="font-semibold text-gray-700 text-[11px]">{f.created_by || 'Usuario'}</div>
                  <div className="text-gray-400 text-[11px] whitespace-nowrap">{fmtDate(f.created_at?.substring(0, 10) || f.briefing_date)}</div>
                </div>
                <div className="text-gray-600 leading-relaxed">{f.feedback}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
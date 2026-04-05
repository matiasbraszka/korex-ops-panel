import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TASK_STATUS } from '../utils/constants';
import { getBottleneck, progress, fmtDate, today } from '../utils/helpers';
import { sbFetch } from '../utils/supabase';

export default function InformePage() {
  const { clients, tasks, briefing, setBriefing, reportFeedbacks, setReportFeedbacks, taskProposals, setTaskProposals, currentUser, createTask, updateTask } = useApp();
  const [feedbackText, setFeedbackText] = useState('');
  const [reportStatus, setReportStatus] = useState(null); // 'generating' | 'success' | 'error'

  const pending = taskProposals.filter(p => p.approval === 'pending');
  const processed = taskProposals.filter(p => p.approval !== 'pending');
  const stored = briefing;

  const generateOpsReport = async () => {
    setReportStatus('generating');
    const d = today();
    let report = `# Informe de Operaciones \u2014 ${new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}\n\n`;

    const totalClients = clients.length;
    const blocked = clients.filter(c => {
      const rt = tasks.filter(t => t.clientId === c.id && t.isRoadmapTask);
      if (rt.length > 0) return rt.some(t => t.status === 'blocked');
      return c.steps.some(s => s.status === 'blocked');
    }).length;
    const waiting = clients.filter(c => {
      const rt = tasks.filter(t => t.clientId === c.id && t.isRoadmapTask);
      if (rt.length > 0) return rt.some(t => t.isClientTask && t.status !== 'done');
      return c.steps.some(s => s.status === 'waiting-client');
    }).length;
    const launched = clients.filter(c => {
      const lt = tasks.find(t => t.clientId === c.id && t.isRoadmapTask && t.templateId === 'lanzamiento');
      if (lt) return lt.status === 'done';
      return c.steps[17] && c.steps[17].status === 'completed';
    }).length;
    const urgentTasks = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
    const blockedTasks = tasks.filter(t => t.status === 'blocked' || t.status === 'retrasadas').length;

    report += `## Resumen general\n`;
    report += `- **${totalClients}** clientes activos, **${launched}** con ads lanzados\n`;
    report += `- **${blocked}** clientes bloqueados, **${waiting}** esperando cliente\n`;
    report += `- **${urgentTasks}** tareas urgentes, **${blockedTasks}** tareas bloqueadas/retrasadas\n\n`;

    const critical = clients.filter(c => (c.priority || 4) <= 2);
    if (critical.length) {
      report += `## Clientes criticos y urgentes\n`;
      critical.forEach(c => {
        const bn = getBottleneck(c, tasks);
        const pct = progress(c, tasks);
        report += `- **${c.name}** (${c.company}) \u2014 ${pct}% \u2014 ${bn || 'Sin bloqueo'}\n`;
      });
      report += '\n';
    }

    const blockedClients = clients.filter(c => {
      const rt = tasks.filter(t => t.clientId === c.id && t.isRoadmapTask);
      if (rt.length > 0) return rt.some(t => t.status === 'blocked');
      return c.steps.some(s => s.status === 'blocked');
    });
    if (blockedClients.length) {
      report += `## Clientes bloqueados\n`;
      blockedClients.forEach(c => {
        const bn = getBottleneck(c, tasks);
        report += `- **${c.name}**: ${bn}\n`;
      });
      report += '\n';
    }

    const adsActive = clients.filter(c => c.metaMetrics && c.metaMetrics.adsActive);
    if (adsActive.length) {
      report += `## Publicidad activa\n`;
      report += `| Cliente | Inversion 7d | Leads 7d | CPL | Ayer |\n`;
      report += `|---------|-------------|----------|-----|------|\n`;
      adsActive.forEach(c => {
        const m = c.metaMetrics;
        const cs = m.currency === 'EUR' ? '\u20AC' : m.currency === 'MXN' ? 'MX$' : '$';
        report += `| ${c.name} | ${cs}${m.totalSpend7d?.toFixed(2)} | ${m.totalConversions7d} | ${cs}${m.avgCpl7d?.toFixed(2)} | ${cs}${m.spendYesterday?.toFixed(2)} / ${m.conversionsYesterday} leads |\n`;
      });
      report += '\n';
    }

    const recentTasks = tasks.filter(t => t.status !== 'done').sort((a, b) => {
      const ps = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (ps[a.priority] || 2) - (ps[b.priority] || 2);
    }).slice(0, 15);
    if (recentTasks.length) {
      report += `## Tareas pendientes (top 15)\n`;
      recentTasks.forEach(t => {
        const c = clients.find(x => x.id === t.clientId);
        const ts = TASK_STATUS[t.status] || TASK_STATUS.backlog;
        report += `- [${ts.label}] **${c ? c.name : '?'}**: ${t.title}${t.assignee ? ' (' + t.assignee + ')' : ''}\n`;
      });
      report += '\n';
    }

    report += `---\n*Generado automaticamente desde el panel de operaciones.*`;

    const newBriefing = { id: 'latest', date: d, text: report, source: 'panel-manual' };
    try {
      const ok = await sbFetch('briefings', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify(newBriefing)
      });
      if (ok) {
        console.log('[InformePage] Informe guardado en Supabase correctamente', { date: d });
        setBriefing(newBriefing);
        setReportStatus('success');
        setTimeout(() => setReportStatus(null), 4000);
      } else {
        console.error('[InformePage] Error al guardar informe: sbFetch retorno falsy');
        setReportStatus('error');
        setTimeout(() => setReportStatus(null), 6000);
      }
    } catch (err) {
      console.error('[InformePage] Excepcion al guardar informe:', err);
      setReportStatus('error');
      setTimeout(() => setReportStatus(null), 6000);
    }
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

  const renderMarkdown = (text) => {
    let html = text;
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^- (.+)$/gm, '\u2022 $1');
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--color-border);margin:12px 0;">');
    html = html.replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => c.trim().match(/^-+$/))) return '';
      return '<tr>' + cells.map(c => '<td>' + c.trim() + '</td>').join('') + '</tr>';
    });
    return html;
  };

  const renderProposals = (proposals, isPending) => (
    <div className="bg-white border border-border rounded-[14px] py-5 px-6 mb-5">
      <div className="text-sm font-semibold mb-1">{isPending ? '\u26A1 Propuestas de cambios en tareas' : 'Propuestas procesadas'}</div>
      <div className="text-[11px] text-text3 mb-3.5">{isPending ? 'El agente de operaciones propone estos cambios. Aprueba o rechaza cada uno.' : 'Historial de propuestas ya procesadas.'}</div>
      {proposals.map(p => {
        const client = clients.find(c => c.id === p.client_id);
        const clientName = client ? client.name : (p.client_id || '\u2014');
        const typeLabel = p.type === 'create' ? 'CREAR TAREA' : p.type === 'complete' ? 'COMPLETAR TAREA' : 'ACTUALIZAR TAREA';
        const typeBorder = p.type === 'create' ? 'var(--color-green)' : p.type === 'complete' ? 'var(--color-purple)' : 'var(--color-blue)';
        const typeColor = p.type === 'create' ? 'var(--color-green)' : p.type === 'complete' ? 'var(--color-purple)' : 'var(--color-blue)';
        const statusClass = p.approval === 'approved' ? 'opacity-50 bg-green-bg' : p.approval === 'rejected' ? 'opacity-40 bg-surface2 line-through' : '';

        return (
          <div key={p.id} className={`border border-border rounded-[10px] py-3 px-4 mb-2 transition-all ${statusClass}`} style={{ borderLeftWidth: 3, borderLeftColor: typeBorder }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.5px] mb-1" style={{ color: typeColor }}>{typeLabel}</div>
            <div className="text-[13px] font-semibold mb-0.5">{p.title || '\u2014'}</div>
            <div className="text-[11px] text-text2 mb-0.5">
              Cliente: <strong>{clientName}</strong>
              {p.assignee && <> {'\u00B7'} Asignar a: <strong>{p.assignee}</strong></>}
              {p.priority && <> {'\u00B7'} Prioridad: {p.priority}</>}
              {p.status && p.type === 'update' && <> {'\u00B7'} Estado: {p.status}</>}
            </div>
            {p.reason && <div className="text-[11px] text-text3 italic mb-2">&ldquo;{p.reason}&rdquo;</div>}
            {isPending ? (
              <div className="flex gap-1.5">
                <button className="py-[5px] px-3.5 rounded-md border-none text-[11px] font-medium cursor-pointer font-sans bg-green text-white hover:opacity-90" onClick={() => approveProposal(p.id)}>Aprobar</button>
                <button className="py-[5px] px-3.5 rounded-md text-[11px] font-medium cursor-pointer font-sans bg-transparent text-red border hover:bg-red-bg" style={{ borderColor: 'rgba(239,68,68,0.27)' }} onClick={() => rejectProposal(p.id)}>Rechazar</button>
              </div>
            ) : (
              <div className="text-[10px] text-text3">{p.approval === 'approved' ? '\u2713 Aprobada' : '\u2715 Rechazada'}</div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Pending proposals */}
      {pending.length > 0 && renderProposals(pending, true)}

      {/* Generate button */}
      <div className="mb-4 flex gap-2.5 items-center">
        <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] font-medium cursor-pointer font-sans hover:bg-blue-dark flex items-center gap-1.5 disabled:opacity-50" onClick={generateOpsReport} disabled={reportStatus === 'generating'}>{reportStatus === 'generating' ? 'Generando...' : 'Generar informe ahora'}</button>
        {reportStatus === 'success' && <span className="text-[11px] text-green font-semibold py-1 px-2.5 bg-green-50 rounded-md">{'\u2713'} Informe generado y guardado en Supabase correctamente</span>}
        {reportStatus === 'error' && <span className="text-[11px] text-red font-semibold py-1 px-2.5 bg-red-50 rounded-md">{'\u2715'} Error al guardar el informe. Revisa la consola y reintenta.</span>}
        {!reportStatus && <span className="text-[11px] text-text3">Crea un informe con el estado actual de todos los clientes y publicidad</span>}
      </div>

      {/* Full report */}
      {stored && stored.text ? (
        <div className="bg-white border border-border rounded-[14px] py-7 px-8 mb-5">
          <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-border">
            <span className="bg-blue text-white text-[10px] font-bold py-[3px] px-2.5 rounded-[10px] tracking-[0.5px]">INFORME DIARIO</span>
            <span className="text-xs text-text3">{stored.date || '\u2014'}</span>
            <span className="text-[11px] text-text3 ml-auto">Fuente: {stored.source || 'ops-agent'}</span>
          </div>
          <div className="text-[13px] leading-[1.8] text-text whitespace-pre-wrap [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-4 [&_h1]:mb-2 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-blue [&_h2]:my-4 [&_h2]:mb-2 [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:my-4 [&_h3]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2.5 [&_table]:text-xs [&_th]:bg-surface2 [&_th]:font-semibold [&_th]:text-left [&_th]:py-1.5 [&_th]:px-2.5 [&_th]:border [&_th]:border-border [&_td]:py-1.5 [&_td]:px-2.5 [&_td]:border [&_td]:border-border" dangerouslySetInnerHTML={{ __html: renderMarkdown(stored.text) }} />
        </div>
      ) : (
        <div className="bg-white border border-border rounded-[14px] py-7 px-8 mb-5">
          <div className="text-center py-[60px] text-text3">
            <div className="text-[40px] mb-3">{'\uD83D\uDCCB'}</div>
            <div className="text-sm font-semibold mb-1.5">Sin informe disponible</div>
            <div className="text-xs">El agente de operaciones enviara el proximo informe automaticamente cada dia.</div>
          </div>
        </div>
      )}

      {/* Feedback section */}
      <div className="bg-white border border-border rounded-[14px] py-5 px-6 mb-5">
        <div className="text-sm font-semibold mb-1">Feedback sobre el informe</div>
        <div className="text-[11px] text-text3 mb-3">Deja correcciones o contexto adicional. La IA lo usara para mejorar los proximos informes.</div>
        <div className="flex gap-2">
          <textarea
            className="flex-1 border border-border rounded-[10px] py-2.5 px-3.5 text-xs font-sans resize-y min-h-[60px] outline-none focus:border-blue"
            placeholder="Ej: 'Matias ya reviso lo de Sergio, esta listo' o 'La tarea de Victor ya se resolvio ayer'"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
          />
          <button className="self-end py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] font-medium cursor-pointer font-sans hover:bg-blue-dark" onClick={submitReportFeedback}>Enviar</button>
        </div>
        {reportFeedbacks.length > 0 && (
          <div className="mt-3.5">
            {[...reportFeedbacks].reverse().slice(0, 10).map((f, i) => (
              <div key={i} className="flex gap-2.5 py-2 border-t border-border/40 text-xs">
                <div><div className="font-semibold text-text text-[11px]">{f.created_by || 'Usuario'}</div><div className="text-text3 text-[11px] whitespace-nowrap">{fmtDate(f.created_at?.substring(0, 10) || f.briefing_date)}</div></div>
                <div className="text-text2 leading-relaxed">{f.feedback}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Processed proposals */}
      {processed.length > 0 && renderProposals(processed, false)}
    </div>
  );
}
import { useApp } from '../context/AppContext';
import { initials, fmtDate, today } from '../utils/helpers';
import KpiRow from '../components/KpiRow';

export default function FeedbackPage() {
  const { clients, updateClient, createTask, updateTask, currentUser, setView, setSelectedId } = useApp();

  let allFb = [];
  clients.forEach(c => {
    (c.clientFeedbacks || []).forEach((f, fi) => {
      allFb.push({ client: c, fb: f, idx: fi });
    });
  });
  allFb.sort((a, b) => (b.fb.date || '').localeCompare(a.fb.date || ''));

  const typeLabels = { complaint: 'Queja', problem: 'Problema', suggestion: 'Sugerencia', request: 'Pedido' };
  const typeBgs = { complaint: 'var(--color-red-bg)', problem: 'var(--color-orange-bg)', suggestion: 'var(--color-blue-bg)', request: 'var(--color-blue-bg)' };

  const total = allFb.length;
  const complaints = allFb.filter(x => x.fb.type === 'complaint' || x.fb.type === 'problem').length;
  const pending = allFb.filter(x => !x.fb.convertedTaskId).length;
  const converted = allFb.filter(x => x.fb.convertedTaskId).length;

  const openClient = (id) => { setSelectedId(id); setView('clients'); };

  const addFbComment = (clientId, fbIdx) => {
    const c = clients.find(x => x.id === clientId);
    if (!c || !c.clientFeedbacks || !c.clientFeedbacks[fbIdx]) return;
    const text = prompt('Tu comentario sobre este feedback:');
    if (!text?.trim()) return;
    const newFbs = [...(c.clientFeedbacks || [])];
    const fb = { ...newFbs[fbIdx] };
    fb.comments = [...(fb.comments || []), { user: currentUser?.name || 'Usuario', text: text.trim(), date: today() }];
    newFbs[fbIdx] = fb;
    updateClient(c.id, { clientFeedbacks: newFbs });
  };

  const convertFbToTask = (clientId, fbIdx) => {
    const c = clients.find(x => x.id === clientId);
    if (!c || !c.clientFeedbacks || !c.clientFeedbacks[fbIdx]) return;
    const fb = c.clientFeedbacks[fbIdx];
    let desc = fb.text;
    if (fb.comments?.length) desc += '\n\nComentarios del equipo:\n' + fb.comments.map(cm => cm.user + ': ' + cm.text).join('\n');
    const t = createTask(fb.text.substring(0, 80), clientId, '', 'normal', 'backlog', '', null);
    updateTask(t.id, { description: desc });
    const newFbs = [...(c.clientFeedbacks || [])];
    newFbs[fbIdx] = { ...newFbs[fbIdx], convertedTaskId: t.id };
    const newHistory = [...c.history, { text: 'Feedback convertido a tarea: ' + fb.text.substring(0, 40), date: today(), color: '#5B7CF5' }];
    updateClient(c.id, { clientFeedbacks: newFbs, history: newHistory });
  };

  return (
    <div>
      <KpiRow items={[
        { label: 'Total feedback', value: total, color: 'var(--color-blue)' },
        { label: 'Quejas / Problemas', value: complaints, color: 'var(--color-red)' },
        { label: 'Pendientes', value: pending, color: 'var(--color-orange)' },
        { label: 'Convertidos a tarea', value: converted, color: 'var(--color-green)' },
      ]} />

      {!allFb.length && (
        <div className="text-center py-10 text-text3">Sin feedback registrado aun. Agrega feedback desde la vista de cada cliente.</div>
      )}

      {allFb.map(({ client: c, fb: f, idx: fi }, i) => {
        const typeLabel = typeLabels[f.type] || 'Pedido';
        const typeBg = typeBgs[f.type] || 'var(--color-blue-bg)';
        return (
          <div key={i} className="bg-white border border-border rounded-[10px] p-4 mb-2.5">
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold cursor-pointer"
                style={{ background: c.color + '15', color: c.color }}
                onClick={() => openClient(c.id)}
              >{initials(c.name)}</div>
              <div className="font-semibold text-[13px] cursor-pointer" onClick={() => openClient(c.id)}>{c.name}</div>
              <span className="py-[2px] px-2 rounded text-[10px] font-semibold" style={{ background: typeBg }}>{typeLabel}</span>
              <span className="text-[10px] text-text3 bg-surface2 py-[2px] px-1.5 rounded-[3px]">{f.source || 'otro'}</span>
              {f.sourceDetail && <span className="text-[10px] text-text3">{f.sourceDetail}</span>}
              <span className="text-[10px] text-text3 ml-auto">{fmtDate(f.date || '')}</span>
            </div>
            <div className="text-[13px] leading-relaxed mb-2">{f.text}</div>
            {f.comments?.length > 0 && (
              <div className="border-l-2 border-border pl-2.5 mb-2">
                {f.comments.map((cm, ci) => (
                  <div key={ci} className="text-xs mb-1"><strong>{cm.user}:</strong> {cm.text} <span className="text-[9px] text-text3">{fmtDate(cm.date)}</span></div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-center">
              <button className="py-1 px-2 rounded-md bg-transparent text-text2 border-none cursor-pointer text-xs font-sans hover:bg-surface2" onClick={() => addFbComment(c.id, fi)}>Comentar</button>
              {!f.convertedTaskId ? (
                <button className="py-1 px-2 rounded-md bg-blue text-white border-none cursor-pointer text-xs font-sans hover:bg-blue-dark" onClick={() => convertFbToTask(c.id, fi)}>Crear tarea</button>
              ) : (
                <span className="text-[11px] text-green font-semibold">{'\u2713'} Tarea creada</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
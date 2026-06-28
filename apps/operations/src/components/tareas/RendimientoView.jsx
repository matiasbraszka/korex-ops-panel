import { useState, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight, Play, Pencil, X, Check, RotateCcw, ImagePlus, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import { isAssignedTo, sprintProgress, memberReportCompliance, SPRINT_TEAM_IDS } from '../../utils/helpers';
import { uploadInformeCaptura, MAX_CAPTURA_BYTES } from '../informes/capturas';

const GRID = '168px 52px 56px 54px 50px 72px 58px 56px 150px 62px 58px 92px';
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V'];
const compColor = (pct) => pct >= 75 ? '#15803D' : (pct < 50 ? '#DC2626' : '#1A1D26');
// Color del "n/5" de informes: verde si está completo, rojo si flojo.
const fiveColor = (n) => n >= 5 ? '#15803D' : (n <= 2 ? '#DC2626' : '#B45309');

function StatPill({ status }) {
  const st = TASK_STATUS[status] || TASK_STATUS.backlog;
  return <span style={{ justifySelf: 'start', fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 5, padding: '3px 9px', whiteSpace: 'nowrap' }}>{st.label}</span>;
}

function CallLink({ url, label, onEdit }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {url
        ? <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#3F4653', textDecoration: 'none', border: '1px solid #E2E5EB', borderRadius: 8, padding: '6px 11px' }}><Play size={13} fill="#5B7CF5" stroke="none" />{label}</a>
        : <span onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#9CA3AF', cursor: 'pointer', border: '1px solid #E2E5EB', borderRadius: 8, padding: '6px 11px' }}><Play size={13} fill="#9CA3AF" stroke="none" />{label}</span>}
      <span onClick={onEdit} title="Editar link" style={{ marginLeft: 2, color: '#C7CBD3', cursor: 'pointer', padding: 2 }}><Pencil size={11} /></span>
    </span>
  );
}

export default function RendimientoView() {
  const { activeSprint, sprints, tasks, teamMembers, teamReports, currentUser, updateSprint, updateTeamMember, finalizeSprint } = useApp();
  const [perfOpen, setPerfOpen] = useState({});
  const [histOpen, setHistOpen] = useState({});
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [conclusion, setConclusion] = useState('');
  const [closeShot, setCloseShot] = useState(null);   // captura del cierre { url, path, name }
  const [shotUploading, setShotUploading] = useState(false);
  const shotInputRef = useRef(null);

  const rows = useMemo(() => {
    if (!activeSprint) return [];
    const st = tasks.filter(t => t.sprintId === activeSprint.id);
    const worked = activeSprint.workedHours || {};
    // Solo el equipo interno que se mide en el sprint (en el orden definido),
    // aunque no tengan tareas: así se registra la asistencia y el cumplimiento.
    return SPRINT_TEAM_IDS
      .map(id => (teamMembers || []).find(m => m.id === id))
      .filter(Boolean)
      .map(m => {
      const mt = st.filter(t => isAssignedTo(t, m));
      const done = mt.filter(t => t.status === 'done').length;
      const comp = memberReportCompliance(teamReports, m.id, activeSprint);
      return {
        m, tasks: mt, assigned: mt.length,
        enCurso: mt.filter(t => t.status === 'in-progress').length,
        enRev: mt.filter(t => t.status === 'en-revision').length,
        done,
        cargadas: mt.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0),
        trabajadas: Number(worked[m.id]) || 0,
        capacidad: m.weekly_capacity != null ? Number(m.weekly_capacity) : null,
        pct: mt.length ? Math.round(done / mt.length * 100) : 0,
        dailyReports: comp.daily,
        weeklyReport: comp.weekly,
      };
    });
  }, [activeSprint, tasks, teamMembers, teamReports]);

  const prog = activeSprint ? sprintProgress(tasks, activeSprint) : { done: 0, total: 0, pct: 0 };
  const cPct = prog.pct;
  const initials = (m) => (m?.initials || m?.name?.slice(0, 2) || '?').toUpperCase();

  const setWorked = (id, val) => { const v = val === '' ? undefined : Number(val); const map = { ...(activeSprint.workedHours || {}) }; if (v === undefined) delete map[id]; else map[id] = v; updateSprint(activeSprint.id, { workedHours: map }); };
  // Marca/desmarca la asistencia de una persona a la daily del día idx (0=Lun … 4=Vie).
  const setAttend = (memberId, idx) => {
    const map = { ...(activeSprint.dailyAttendance || {}) };
    const arr = Array.isArray(map[memberId]) ? [...map[memberId]] : [false, false, false, false, false];
    arr[idx] = !arr[idx];
    map[memberId] = arr;
    updateSprint(activeSprint.id, { dailyAttendance: map });
  };
  // Sube la captura del estado de las tareas al cerrar el sprint.
  const onPickShot = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) { alert('Subí una imagen.'); return; }
    if (file.size > MAX_CAPTURA_BYTES) { alert('La imagen supera los 10 MB.'); return; }
    setShotUploading(true);
    try { setCloseShot(await uploadInformeCaptura(currentUser?.id, file)); }
    catch (e) { console.warn('close screenshot', e); alert('No se pudo subir la captura.'); }
    finally { setShotUploading(false); }
  };
  const setCap = (id, val) => updateTeamMember(id, { weekly_capacity: val === '' ? null : Number(val) });
  const editCall = (field, label) => { const url = window.prompt(`Link de la grabación — ${label}:`, activeSprint[field] || ''); if (url !== null) updateSprint(activeSprint.id, { [field]: url.trim() || null }); };

  const closed = useMemo(() => (sprints || []).filter(s => s.status === 'closed').sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))), [sprints]);

  const thStyle = { fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#9CA3AF' };

  if (!activeSprint) {
    return <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 16, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No hay un sprint activo todavía.</div>;
  }

  return (
    <div>
      {/* banner */}
      <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 16, boxShadow: '0 1px 2px rgba(10,22,40,.05)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} /><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#22C55E' }}>Sprint en vivo</span></div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{activeSprint.name}</span>
            <span style={{ fontSize: 14, color: '#9CA3AF' }}>{activeSprint.startDate} → {activeSprint.endDate}</span>
          </div>
          <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
            <CallLink url={activeSprint.mondayCallUrl} label="Llamada del lunes" onEdit={() => editCall('mondayCallUrl', 'Llamada del lunes')} />
            <CallLink url={activeSprint.fridayCallUrl} label="Llamada del viernes" onEdit={() => editCall('fridayCallUrl', 'Llamada del viernes')} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: '#9CA3AF' }}>Cumplimiento</div>
          <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 4, color: compColor(cPct) }}>{cPct}%</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{prog.done}/{prog.total} tareas cumplidas</div>
        </div>
      </div>

      {/* tabla por persona */}
      <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 16, boxShadow: '0 1px 2px rgba(10,22,40,.05)', overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1080 }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '12px 18px', borderBottom: '1px solid #E2E5EB', background: '#F7F8FA' }}>
              <span style={thStyle}>Persona</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>Asign.</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>En curso</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>En rev.</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>Term.</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>Cargadas</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>Trabajó</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>Capac.</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>Dailies</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>Inf. día</span>
              <span style={{ ...thStyle, textAlign: 'center' }}>Inf. sem</span>
              <span style={thStyle}>Avance</span>
            </div>
            {rows.length === 0 && <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 26 }}>El sprint todavía no tiene tareas asignadas.</div>}
            {rows.map(r => {
              const over = r.capacidad != null && r.cargadas > r.capacidad;
              const open = !!perfOpen[r.m.id];
              return (
                <div key={r.m.id} style={{ borderBottom: '1px solid #F0F2F5' }}>
                  <div onClick={() => setPerfOpen(s => ({ ...s, [r.m.id]: !s[r.m.id] }))} style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '11px 18px', cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <span style={{ color: '#9CA3AF', flexShrink: 0, display: 'flex' }}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', background: r.m.color || '#9CA3AF', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(r.m)}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.m.name}</span>
                    </span>
                    <span style={{ fontSize: 13, textAlign: 'center', color: '#1A1D26' }}>{r.assigned}</span>
                    <span style={{ fontSize: 13, textAlign: 'center', color: '#5B7CF5', fontWeight: 600 }}>{r.enCurso}</span>
                    <span style={{ fontSize: 13, textAlign: 'center', color: '#BE185D', fontWeight: 600 }}>{r.enRev}</span>
                    <span style={{ fontSize: 13, textAlign: 'center', color: '#15803D', fontWeight: 600 }}>{r.done}</span>
                    <span style={{ fontSize: 13, textAlign: 'center', fontWeight: over ? 700 : 500, color: over ? '#DC2626' : '#1A1D26', background: over ? '#FEF2F2' : 'transparent', borderRadius: 7, padding: '4px 0' }}>{r.cargadas}h</span>
                    <span style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="number" min="0" step="0.5" defaultValue={r.trabajadas || ''} placeholder="–" onBlur={(e) => setWorked(r.m.id, e.target.value)} style={{ width: 52, textAlign: 'center', fontSize: 13, color: '#6B7280', border: '1px solid #E2E5EB', borderRadius: 6, padding: '4px 2px', outline: 'none', fontFamily: 'inherit' }} />
                    </span>
                    <span style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="number" min="0" step="0.5" defaultValue={r.capacidad ?? ''} placeholder="–" onBlur={(e) => setCap(r.m.id, e.target.value)} style={{ width: 52, textAlign: 'center', fontSize: 13, color: '#9CA3AF', border: '1px solid #E2E5EB', borderRadius: 6, padding: '4px 2px', outline: 'none', fontFamily: 'inherit' }} />
                    </span>
                    {/* Asistencia a las dailys: 5 toggles (L M X J V) */}
                    <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                      {DAY_LABELS.map((d, idx) => {
                        const present = !!(activeSprint.dailyAttendance?.[r.m.id]?.[idx]);
                        return (
                          <span key={idx} onClick={() => setAttend(r.m.id, idx)} title={`Daily ${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'][idx]}`}
                            style={{ width: 21, height: 21, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, border: present ? 'none' : '1px solid #D0D5DD', background: present ? '#22C55E' : '#fff', color: present ? '#fff' : '#9CA3AF' }}>{d}</span>
                        );
                      })}
                    </span>
                    {/* Informes diarios cargados en la semana / 5 */}
                    <span style={{ fontSize: 13, textAlign: 'center', fontWeight: 600, color: fiveColor(r.dailyReports) }}>{r.dailyReports}/5</span>
                    {/* Informe semanal cargado */}
                    <span style={{ display: 'flex', justifyContent: 'center' }}>
                      {r.weeklyReport
                        ? <span title="Cargó el informe semanal" style={{ width: 20, height: 20, borderRadius: '50%', background: '#22C55E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={12} strokeWidth={3} /></span>
                        : <span title="Sin informe semanal" style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #E2E5EB', color: '#C7CBD3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} strokeWidth={2.5} /></span>}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ flex: 1, height: 7, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', background: '#22C55E', width: r.pct + '%' }} /></span><span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280' }}>{r.pct}%</span></span>
                  </div>
                  {open && (
                    <div style={{ background: '#FBFBFD', borderTop: '1px solid #F0F2F5', padding: '10px 18px 14px 60px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {r.tasks.length === 0 && <span style={{ fontSize: 12.5, color: '#9CA3AF' }}>Sin tareas en el sprint.</span>}
                      {r.tasks.map(t => (
                        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '104px 1fr', alignItems: 'center', gap: 11 }}>
                          <StatPill status={t.status} />
                          <span style={{ fontSize: 13, color: '#3F4653', lineHeight: 1.4, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* finalizar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 38 }}>
        <span onClick={() => { setConclusion(''); setCloseShot(null); setFinalizeOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#fff', background: '#5B7CF5', borderRadius: 10, padding: '11px 18px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(10,22,40,.12)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M5 13l4 4L19 7" /></svg>Finalizar sprint
        </span>
      </div>

      {/* historial */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <RotateCcw size={16} stroke="#5B7CF5" strokeWidth={1.9} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1D26' }}>Historial de sprints</span>
        <span style={{ fontSize: 13, color: '#9CA3AF' }}>· {closed.length} {closed.length === 1 ? 'sprint cerrado' : 'sprints cerrados'}</span>
      </div>
      {closed.length === 0 && <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14, padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Todavía no cerraste ningún sprint. Cuando finalices el de esta semana, aparece acá.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {closed.map(h => {
          const sm = h.summary || {};
          const per = Array.isArray(sm.perPerson) ? sm.perPerson : [];
          const blockers = Array.isArray(sm.blockers) ? sm.blockers : [];
          const pct = sm.proposed ? Math.round((sm.done || 0) / sm.proposed * 100) : 0;
          const open = !!histOpen[h.id];
          const memberName = (id) => (teamMembers || []).find(m => m.id === id)?.name || id;
          const memberColor = (id) => (teamMembers || []).find(m => m.id === id)?.color || '#9CA3AF';
          return (
            <div key={h.id} style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 14, boxShadow: '0 1px 2px rgba(10,22,40,.05)', overflow: 'hidden' }}>
              <div onClick={() => setHistOpen(s => ({ ...s, [h.id]: !s[h.id] }))} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}>
                <span style={{ color: '#9CA3AF', flexShrink: 0, display: 'flex' }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{h.name}</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{h.startDate} → {h.endDate}</div>
                </div>
                <span style={{ height: 8, width: 120, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden', display: 'inline-block', flexShrink: 0 }}><span style={{ display: 'block', height: '100%', background: '#22C55E', width: pct + '%' }} /></span>
                <div style={{ textAlign: 'right', width: 92, flexShrink: 0 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{pct}%</div><div style={{ fontSize: 11, color: '#9CA3AF' }}>{sm.done || 0}/{sm.proposed || 0} tareas</div></div>
              </div>
              {open && (
                <div style={{ borderTop: '1px solid #E2E5EB', background: '#FBFBFD', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {per.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 9 }}>Por persona</div>
                      <div style={{ overflowX: 'auto' }}><div style={{ minWidth: 640, border: '1px solid #E2E5EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 76px 104px 78px 58px 58px', gap: 8, padding: '8px 13px', borderBottom: '1px solid #F0F2F5', background: '#F7F8FA' }}><span style={thStyle}>Persona</span><span style={{ ...thStyle, textAlign: 'center' }}>Tareas</span><span style={{ ...thStyle, textAlign: 'center' }}>Horas</span><span style={{ ...thStyle, textAlign: 'center' }}>Asist.</span><span style={{ ...thStyle, textAlign: 'center' }}>Inf. día</span><span style={{ ...thStyle, textAlign: 'center' }}>Inf. sem</span></div>
                        {per.map(pp => (
                          <div key={pp.memberId} style={{ display: 'grid', gridTemplateColumns: '1.4fr 76px 104px 78px 58px 58px', gap: 8, padding: '8px 13px', borderBottom: '1px solid #F4F5F7', alignItems: 'center' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 23, height: 23, borderRadius: '50%', background: memberColor(pp.memberId), color: '#fff', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{(pp.name || memberName(pp.memberId) || '').slice(0, 2).toUpperCase()}</span><span style={{ fontSize: 12.5, color: '#1A1D26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pp.name || memberName(pp.memberId)}</span></span>
                            <span style={{ fontSize: 12.5, textAlign: 'center', color: '#3F4653' }}>{pp.done}/{pp.assigned}</span>
                            <span style={{ fontSize: 12.5, textAlign: 'center', color: '#6B7280' }}>{pp.loadedHours || 0}h / {pp.workedHours || 0}h</span>
                            <span style={{ fontSize: 12.5, textAlign: 'center', fontWeight: 600, color: pp.attendance == null ? '#9CA3AF' : fiveColor(pp.attendance) }}>{pp.attendance == null ? '—' : `${pp.attendance}/5`}</span>
                            <span style={{ fontSize: 12.5, textAlign: 'center', fontWeight: 600, color: pp.dailyReports == null ? '#9CA3AF' : fiveColor(pp.dailyReports) }}>{pp.dailyReports == null ? '—' : `${pp.dailyReports}/5`}</span>
                            <span style={{ fontSize: 13, textAlign: 'center', fontWeight: 700, color: pp.weeklyReport == null ? '#9CA3AF' : (pp.weeklyReport ? '#15803D' : '#DC2626') }}>{pp.weeklyReport == null ? '—' : (pp.weeklyReport ? '✓' : '✗')}</span>
                          </div>
                        ))}
                      </div></div>
                    </div>
                  )}
                  {blockers.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 9 }}>Bloqueos</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{blockers.map((b, i) => <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: '#3F4653' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', marginTop: 6, flexShrink: 0 }} /><span style={{ lineHeight: 1.5 }}>{b}</span></div>)}</div>
                    </div>
                  )}
                  {h.conclusion && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 9 }}>Conclusión y acciones</div>
                      <div style={{ fontSize: 13, color: '#3F4653', lineHeight: 1.6, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, padding: '12px 14px', whiteSpace: 'pre-wrap' }}>{h.conclusion}</div>
                    </div>
                  )}
                  {h.closeScreenshotUrl && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 9 }}>Captura del estado al cierre</div>
                      <a href={h.closeScreenshotUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', lineHeight: 0 }}>
                        <img src={h.closeScreenshotUrl} alt="Estado de las tareas al cierre" style={{ maxWidth: 280, maxHeight: 200, borderRadius: 10, border: '1px solid #E2E5EB' }} />
                      </a>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                    {h.mondayCallUrl && <a href={h.mondayCallUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#3F4653', textDecoration: 'none', border: '1px solid #E2E5EB', borderRadius: 8, padding: '6px 11px', background: '#fff' }}><Play size={13} fill="#5B7CF5" stroke="none" />Llamada del lunes</a>}
                    {h.fridayCallUrl && <a href={h.fridayCallUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#3F4653', textDecoration: 'none', border: '1px solid #E2E5EB', borderRadius: 8, padding: '6px 11px', background: '#fff' }}><Play size={13} fill="#5B7CF5" stroke="none" />Llamada del viernes</a>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* modal finalizar */}
      {finalizeOpen && (
        <div onClick={() => setFinalizeOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.42)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(10,22,40,.28)', width: 520, maxWidth: '94vw', padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Finalizar {activeSprint.name}</div>
              <span onClick={() => setFinalizeOpen(false)} style={{ cursor: 'pointer', color: '#6B7280' }}><X size={18} /></span>
            </div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 5, lineHeight: 1.5 }}>Escribí la conclusión de la semana: qué mejoramos, qué nos trabó y las acciones para el próximo sprint. Las tareas sin terminar pasan al sprint siguiente y se archiva el resumen.</div>
            <textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} autoFocus placeholder="Conclusión de la semana…" style={{ width: '100%', marginTop: 15, minHeight: 120, fontFamily: 'inherit', fontSize: 13, color: '#1A1D26', border: '1px solid #E2E5EB', borderRadius: 10, padding: '12px 13px', outline: 'none', resize: 'vertical', lineHeight: 1.55 }} />

            {/* Captura del estado de las tareas al cerrar (prueba) */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#3F4653', marginBottom: 7 }}>Captura del estado de las tareas <span style={{ color: '#9CA3AF', fontWeight: 500 }}>(opcional)</span></div>
              <input ref={shotInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { onPickShot(e.target.files?.[0]); e.target.value = ''; }} />
              {closeShot ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <a href={closeShot.url} target="_blank" rel="noreferrer"><img src={closeShot.url} alt="captura" style={{ height: 56, width: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid #E2E5EB' }} /></a>
                  <span style={{ fontSize: 12.5, color: '#6B7280', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{closeShot.name}</span>
                  <span onClick={() => setCloseShot(null)} style={{ cursor: 'pointer', color: '#9CA3AF', display: 'flex' }} title="Quitar captura"><X size={16} /></span>
                </div>
              ) : (
                <span onClick={() => { if (!shotUploading) shotInputRef.current?.click(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#5B7CF5', border: '1px dashed #C7D2FE', borderRadius: 9, padding: '9px 13px', cursor: shotUploading ? 'default' : 'pointer' }}>
                  {shotUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={15} />}{shotUploading ? 'Subiendo…' : 'Adjuntar captura'}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <span onClick={() => setFinalizeOpen(false)} style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', border: '1px solid #E2E5EB', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>Cancelar</span>
              <span onClick={() => { finalizeSprint(conclusion, closeShot?.url || null); setFinalizeOpen(false); setCloseShot(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#fff', background: '#22C55E', borderRadius: 10, padding: '10px 18px', cursor: 'pointer' }}><Check size={16} strokeWidth={2.4} />Finalizar y archivar</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { PROCESS_STEPS, PHASES, PRIO_CLIENT, STATUS, TASK_STATUS } from '../utils/constants';
import { initials, progress, getAllPhases, getRoadmapTasks, daysAgo, fmtDate, clientPill, today, userOwnsTask } from '../utils/helpers';
import Modal from '../components/Modal';
import Dropdown from '../components/Dropdown';
import StatusPill from '../components/StatusPill';
import TeamAvatar from '../components/TeamAvatar';
import { ResourcesPanel } from '@korex/ui';
import { HistorialTab } from './historial/HistorialTab.jsx';
import { Pencil, Trash2, Inbox, Calendar, User, Key, ExternalLink, Folder, FileText, CreditCard, Megaphone, Image as ImageIcon, Layers, ChevronRight, ArrowLeft, Plus, Clock, Building2, Users, Tag } from 'lucide-react';
import FunnelsView from '../components/clientes/FunnelsView';
import ContratoTab from '../components/clientes/ContratoTab';
import DmeClientPanel from '../components/dme/DmeClientPanel';
import EditClientModal from '../components/clientes/EditClientModal';
import MetaAdAccountsManager from '../components/clientes/MetaAdAccountsManager';
import ObjetivosView from '../components/tareas/ObjetivosView';
import SatisfaccionTab from '../components/clientes/SatisfaccionTab';

const CLIENT_RESOURCE_CATEGORIES = ['folder', 'doc', 'sheet', 'landing', 'pdf', 'other'];


export default function ClientDetail({ client: c }) {
  const { setSelectedId, setView, setTaskClientFilter, updateClient, deleteClient, tasks, updateTask, deleteTask, currentUser, getPriorityLabel, getAllPriorityLabels, getPriorityList, teamMembers, strategyPages, contracts, satByClient } = useApp();
  const TEAM = teamMembers || [];
  const [editModal, setEditModal] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [depsModal, setDepsModal] = useState(null);
  const [addPhaseModal, setAddPhaseModal] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseColor, setNewPhaseColor] = useState('#5B7CF5');
  const [deletePhaseConfirm, setDeletePhaseConfirm] = useState(null);
  const [deleteClientModal, setDeleteClientModal] = useState(false);
  const [deleteClientConfirmName, setDeleteClientConfirmName] = useState('');
  const [activeTab, setActiveTab] = useState('trabajo');

  const dropdownRefs = useRef({});

  const canDeleteClient = currentUser?.role === 'COO' || currentUser?.canAccessSettings === true;
  // Usuarios de operaciones que NO son admin: no ven facturación ni pueden editar el cliente.
  const restricted = !!currentUser && !currentUser.isAdmin;

  const clientTasks = tasks.filter(t => t.clientId === c.id);
  // Los usuarios que no son admin solo ven SUS tareas (igual que la lista de la
  // pestaña Tareas): por eso el conteo del tab y el resumen también se filtran.
  const roadmapTasks = (() => {
    const all = getRoadmapTasks(c.id, tasks);
    return restricted ? all.filter(t => userOwnsTask(t, currentUser, TEAM)) : all;
  })();
  // Use new system if client has ANY tasks (not just roadmap-flagged ones)
  const useNewSystem = clientTasks.length > 0;

  const pct = progress(c, tasks);
  const days = daysAgo(c.startDate);
  const p = c.priority || 5;
  const pcfg = getPriorityLabel(p);
  const pill = clientPill(c, tasks);
  const ct = clientTasks.filter(t => t.status !== 'done').length;
  const allPh = getAllPhases(c);

  const getDropdownRef = useCallback((key) => {
    if (!dropdownRefs.current[key]) dropdownRefs.current[key] = { current: null };
    return dropdownRefs.current[key];
  }, []);

  // Edit client modal: form state vive dentro de EditClientModal
  const openEditModal = () => setEditModal(true);


  const handleInlineStartDate = (val) => {
    updateClient(c.id, { startDate: val });
    setEditingStartDate(false);
  };



  // Total roadmap tasks for progress display
  const totalRoadmap = useNewSystem ? roadmapTasks.length : c.steps.length;
  const doneRoadmap = useNewSystem ? roadmapTasks.filter(t => t.status === 'done').length : c.steps.filter(s => s.status === 'completed').length;
  // % de la pestaña Tareas: para no-admin se calcula sobre SUS tareas (consistente
  // con el conteo filtrado); para admin se usa el progreso global del cliente.
  const roadmapPct = restricted ? (totalRoadmap ? Math.round(doneRoadmap / totalRoadmap * 100) : 0) : pct;

  return (
    <div>
      <button className="inline-flex items-center gap-1.5 text-text2 text-[13px] cursor-pointer mb-4 py-1.5 px-2.5 rounded-md bg-transparent border-none font-sans hover:text-blue hover:bg-blue-bg" onClick={() => setSelectedId(null)}>
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
                items={getPriorityList().map(v => ({ label: v.label, iconColor: v.color, icon: '●', onClick: () => { updateClient(c.id, { priority: v.key }); setOpenDropdown(null); } }))}
              />
              <StatusPill text={pill.text} pillClass={pill.pillClass} />
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {c.company && <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-[11.5px] font-semibold" style={{ background: '#EEF2FF', color: '#4338CA' }} title="Empresa donde hace MLM"><Building2 size={12} />{c.company}</span>}
              {c.niche && <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-[11.5px] font-semibold" style={{ background: '#F4F1FE', color: '#7C3AED' }} title="Nicho del cliente"><Tag size={12} />{c.niche}</span>}
              {c.teamName && <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md text-[11.5px] font-semibold" style={{ background: '#ECFDF5', color: '#15803D' }} title="Nombre de equipo"><Users size={12} />{c.teamName}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap text-[12px] max-md:gap-1.5 max-md:mt-2 max-md:text-[11px]" style={{ color: '#6B7280' }}>
              <span className="inline-flex items-center gap-1.5"><Inbox size={14} className="text-[#9CA3AF]" />{c.service || '—'}</span>
              <span className="text-[#D0D5DD]">{'·'}</span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} className="text-[#9CA3AF]" />
                Ingreso{' '}
                {editingStartDate ? (
                  <input type="date" className="border border-blue rounded py-[2px] px-1.5 text-xs font-sans outline-none" defaultValue={c.startDate || ''} autoFocus onBlur={(e) => handleInlineStartDate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
                ) : (
                  <span className="cursor-pointer py-[1px] px-1 rounded hover:bg-surface2" onClick={() => setEditingStartDate(true)}>{fmtDate(c.startDate)}</span>
                )}
                <span className="text-[#D0D5DD] mx-1">{'·'}</span> Día {days}
              </span>
              {ct > 0 && (
                <>
                  <span className="text-[#D0D5DD]">{'·'}</span>
                  <span className="inline-flex items-center gap-1.5 text-blue"><User size={14} />{ct} tareas pendientes</span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 ml-auto shrink-0">
            {!restricted && (
              <button className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-[#E2E5EB] bg-white text-text2 text-xs font-medium cursor-pointer font-sans hover:bg-surface2 hover:text-text max-md:py-1 max-md:px-2 max-md:text-[11px]" onClick={openEditModal}><Pencil size={13} /> Editar</button>
            )}
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
            <span><b className="font-bold" style={{ color: '#1A1D26' }}>{pct}%</b> {'·'} {doneRoadmap}/{totalRoadmap} tareas</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden mt-1.5" style={{ background: '#F0F2F5' }}>
            <div className="h-full rounded-full transition-all" style={{ width: pct + '%', background: '#5B7CF5' }} />
          </div>
        </div>
      </div>

      {(() => {
        // En el detalle del cliente solo mostramos llamadas con categoria='cliente'.
        // Las consultorias/entrenamientos que hicimos PARA su equipo se vinculan al
        // cliente en DB (queda el rastro), pero no aparecen acá para no ensuciar el
        // historial 1-a-1 con el cliente.
        const hasAds = c.metaAds && c.metaAds.length > 0 && c.metaAds.some(a => a.status !== 'interna');
        const adsActive = c.metaMetrics?.adsActive;
        // Los funnels del cliente, directo. Antes habia que dar la vuelta por las
        // estrategias (armar el set de sus ids y filtrar strategy_pages por ahi);
        // ahora el funnel sabe de que cliente es.
        const funnelsCount = (strategyPages || []).filter(p => p.client_id === c.id).length;
        const contractsCount = (contracts || []).filter(ct => ct.client_id === c.id).length;
        // Tareas asignadas al cliente (assignee contiene "cliente")
        const tabs = [
          { key: 'trabajo', label: 'Funnels', count: funnelsCount },
          // La pestaña "Carpetas" (espejo de Drive) se eliminó: todo vive ahora en el
          // sistema propio — los recursos en "Recursos" dentro del DEL de cada funnel.
          { key: 'publicidad', label: 'Publicidad', badge: hasAds ? (adsActive ? 'activa' : 'inactiva') : null },
          { key: 'facturacion', label: 'Contrato', count: contractsCount },
          { key: 'roadmap', label: 'Tareas', count: totalRoadmap - doneRoadmap },
          { key: 'dme', label: 'DME' },
          { key: 'satisfaccion', label: 'Satisfacción' },
          { key: 'historial', label: 'Historial' },
        ].filter(t => !(restricted && t.key === 'facturacion'));
        return (
          <>
            <div className="flex gap-1 border-b border-[#E2E5EB] mb-4 overflow-x-auto">
              {tabs.map(t => {
                const isActive = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`px-3.5 py-2 text-[13px] cursor-pointer border-b-2 transition-colors bg-transparent font-sans whitespace-nowrap inline-flex items-center gap-1.5 ${isActive ? 'border-blue text-blue font-semibold' : 'border-transparent text-text2 font-medium hover:text-text'}`}
                    style={{ marginBottom: '-1px' }}
                  >
                    {t.label}
                    {typeof t.count === 'number' && t.count > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold ${isActive ? 'bg-blue-bg text-blue' : 'bg-surface2 text-text3'}`}>{t.count}</span>
                    )}
                    {t.sub && (
                      <span className={`inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] font-semibold ${isActive ? 'bg-blue-bg text-blue' : 'bg-surface2 text-text3'}`}>{t.sub}</span>
                    )}
                    {t.badge && (
                      <span className={`inline-flex items-center py-[2px] px-1.5 rounded-full text-[9px] font-bold ${t.badge === 'activa' ? 'bg-green-bg text-[#16A34A]' : 'bg-surface2 text-text3'}`}>{t.badge === 'activa' ? '● activa' : '○ inactiva'}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeTab === 'trabajo' && <FunnelsView clientId={c.id} />}

            {activeTab === 'dme' && <DmeClientPanel clientId={c.id} clientName={c.name} />}

            {activeTab === 'satisfaccion' && <SatisfaccionTab sat={satByClient?.[c.id]} clientId={c.id} />}

            {activeTab === 'facturacion' && !restricted && <ContratoTab client={c} />}

            {activeTab === 'roadmap' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <button
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-[#E2E5EB] bg-white text-[12px] font-medium cursor-pointer hover:border-blue hover:text-blue shrink-0"
                    style={{ color: '#6B7280' }}
                    onClick={() => { setTaskClientFilter(c.id); setView('tasks'); }}
                  >
                    Ir a tareas <ChevronRight size={13} />
                  </button>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Tareas pendientes</div>
                    <div className="text-[12px] mt-0.5" style={{ color: '#6B7280' }}>{roadmapPct}% completado · {doneRoadmap}/{totalRoadmap}</div>
                  </div>
                </div>
                <ObjetivosView clientId={c.id} />
              </div>
            )}


            {activeTab === 'publicidad' && (
              <div className="bg-white border border-border rounded-xl overflow-hidden mb-4">
                {(() => {
                  const m = c.metaMetrics || {};
                  const isActive = m.adsActive;
                  const curr = m.currency || 'USD';
                  const cs = curr === 'EUR' ? '€' : curr === 'MXN' ? 'MX$' : '$';
                  return (
                    <div className="py-4 px-5">
                      {isActive && m.totalSpend7d ? (
                          <>
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              <div className="text-center py-3 px-2 bg-surface2 rounded-md"><div className="text-lg font-extrabold tracking-tight">{cs}{m.totalSpend7d?.toFixed(0) || 0}</div><div className="text-[10px] text-text3 uppercase tracking-[0.5px] mt-0.5">Inv. 7d</div></div>
                              <div className="text-center py-3 px-2 bg-surface2 rounded-md"><div className="text-lg font-extrabold tracking-tight text-blue">{m.totalConversions7d || 0}</div><div className="text-[10px] text-text3 uppercase tracking-[0.5px] mt-0.5">Leads 7d</div></div>
                              <div className="text-center py-3 px-2 bg-surface2 rounded-md"><div className="text-lg font-extrabold tracking-tight" style={{ color: m.avgCpl7d > 15 ? 'var(--color-red)' : 'var(--color-green)' }}>{cs}{m.avgCpl7d?.toFixed(2) || '—'}</div><div className="text-[10px] text-text3 uppercase tracking-[0.5px] mt-0.5">CPL prom.</div></div>
                            </div>
                            <div className="flex justify-between items-center text-[12px] text-text2 py-1.5 border-b border-border"><span>Gasto ayer</span><strong>{cs}{m.spendYesterday?.toFixed(2) || '0'}</strong></div>
                            <div className="flex justify-between items-center text-[12px] text-text2 py-1.5 border-b border-border"><span>Leads ayer</span><strong className="text-blue">{m.conversionsYesterday || 0}</strong></div>
                            <div className="flex justify-between items-center text-[12px] text-text2 py-1.5 border-b border-border"><span>Impresiones 7d</span><strong>{(m.impressions7d || 0).toLocaleString()}</strong></div>
                            <div className="flex justify-between items-center text-[12px] text-text2 py-1.5"><span>CTR</span><strong>{m.ctr7d?.toFixed(2) || '—'}%</strong></div>
                            {m.conversionEvent && <div className="mt-2"><span className="text-[10px] bg-purple-bg text-purple py-[2px] px-1.5 rounded font-medium">Evento: {m.conversionEvent}</span></div>}
                            <div className="mt-2 text-[10px] text-text3">Actualizado: {m.lastUpdated || '—'}</div>
                          </>
                        ) : (
                        m.pauseReason ? <div className="text-[12px] text-red py-3">{'⚠'} {m.pauseReason}</div> : <div className="text-center text-text3 text-xs py-6" style={{ color: '#9CA3AF' }}>Sin datos de publicidad recientes</div>
                      )}
                      <MetaAdAccountsManager client={c} updateClient={updateClient} />
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab === 'historial' && (
              <div className="mb-4">
                <HistorialTab cliente={c} />
              </div>
            )}
          </>
        );
      })()}

      {/* Edit Client Modal — 5 secciones (Fase 4 handoff) */}
      <EditClientModal
        open={editModal}
        onClose={() => setEditModal(false)}
        client={c}
        updateClient={updateClient}
        getAllPriorityLabels={getAllPriorityLabels}
      />

      {/* Delete Phase Confirmation */}
      <Modal
        open={!!deletePhaseConfirm}
        onClose={() => setDeletePhaseConfirm(null)}
        title=""
        maxWidth={420}
        footer={null}
      >
        {deletePhaseConfirm && (
          <div className="text-center py-2">
            <div className="text-4xl mb-3">{'\u26A0\uFE0F'}</div>
            <div className="text-[17px] font-bold text-gray-800 mb-2">Eliminar fase</div>
            <div className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-sm font-bold mb-4" style={{ background: deletePhaseConfirm.color + '18', color: deletePhaseConfirm.color }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: deletePhaseConfirm.color }} />
              {deletePhaseConfirm.label}
            </div>
            {deletePhaseConfirm.taskCount > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg py-3 px-4 mb-5 text-left">
                <div className="text-[13px] font-semibold text-red-600 mb-1">{'\u26A0'} Se eliminarán {deletePhaseConfirm.taskCount} tarea{deletePhaseConfirm.taskCount > 1 ? 's' : ''}</div>
                <div className="text-[12px] text-red-500">Todas las tareas dentro de esta fase serán eliminadas permanentemente. Esta acción no se puede deshacer.</div>
              </div>
            ) : (
              <div className="text-[13px] text-gray-500 mb-5">Esta fase no tiene tareas. Se eliminará solo la fase.</div>
            )}
            <div className="flex flex-col gap-2">
              <button
                className="w-full py-3 px-4 rounded-lg border-none bg-blue text-white text-[14px] font-bold cursor-pointer font-sans hover:bg-blue-dark transition-colors"
                onClick={() => setDeletePhaseConfirm(null)}
              >No borrar, mantener la fase</button>
              <button
                className="w-full py-2 px-4 rounded-lg border border-gray-200 bg-white text-gray-400 text-[12px] font-medium cursor-pointer font-sans hover:text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors"
                onClick={() => {
                  const pk = deletePhaseConfirm.phaseKey;
                  const tasksInPhase = clientTasks.filter(t => t.phase === pk);
                  tasksInPhase.forEach(t => deleteTask(t.id));
                  const newCustomPhases = (c.customPhases || []).filter(cp => cp.id !== pk);
                  updateClient(c.id, { customPhases: newCustomPhases });
                  setDeletePhaseConfirm(null);
                }}
              >{deletePhaseConfirm.taskCount > 0 ? `Sí, eliminar fase y sus ${deletePhaseConfirm.taskCount} tareas` : 'Sí, eliminar fase'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Phase Modal */}
      <Modal
        open={addPhaseModal}
        onClose={() => setAddPhaseModal(false)}
        title="Agregar fase personalizada"
        maxWidth={400}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setAddPhaseModal(false)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={() => {
            if (!newPhaseName.trim()) return;
            const phaseId = 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
            const newCustomPhases = [...(c.customPhases || []), { id: phaseId, label: newPhaseName.trim(), color: newPhaseColor }];
            updateClient(c.id, { customPhases: newCustomPhases });
            setAddPhaseModal(false);
            setNewPhaseName('');
            setNewPhaseColor('#5B7CF5');
          }}>Guardar</button>
        </>}
      >
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-[5px]">Nombre de la fase</label>
          <input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="Ej: Seguimiento mensual" value={newPhaseName} onChange={e => setNewPhaseName(e.target.value)} autoFocus />
        </div>
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-[5px]">Color</label>
          <div className="flex gap-2 flex-wrap">
            {['#5B7CF5', '#22C55E', '#EAB308', '#F97316', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6', '#6366F1'].map(color => (
              <button
                key={color}
                className={`w-8 h-8 rounded-full border-2 cursor-pointer ${newPhaseColor === color ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                style={{ background: color }}
                onClick={() => setNewPhaseColor(color)}
              />
            ))}
          </div>
        </div>
      </Modal>

      {/* Dependencies Modal */}
      <Modal
        open={!!depsModal}
        onClose={() => setDepsModal(null)}
        title="Configurar dependencias"
        maxWidth={450}
        footer={<button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={() => setDepsModal(null)}>Cerrar</button>}
      >
        {depsModal && (() => {
          const currentTask = clientTasks.find(t => t.id === depsModal);
          if (!currentTask) return <div className="text-xs text-text3">Tarea no encontrada</div>;
          const otherTasks = clientTasks.filter(t => t.id !== depsModal);
          const currentDeps = currentTask.dependsOn || [];

          // Group other tasks by phase (FIX 4)
          const resolvePhaseForDep = (t) => {
            if (t.phase) return t.phase;
            if (t.stepIdx != null && PROCESS_STEPS[t.stepIdx]) return PROCESS_STEPS[t.stepIdx].phase;
            return '_unphased';
          };
          const depPhaseKeys = [...Object.keys(allPh), '_unphased'];
          const depPhaseGroups = depPhaseKeys.map(pk => {
            const phInfo = pk === '_unphased' ? { label: 'Sin fase', color: '#9CA3AF' } : (allPh[pk] || { label: pk, color: '#9CA3AF' });
            const tasksInPhase = otherTasks.filter(t => resolvePhaseForDep(t) === pk);
            return { pk, phInfo, tasksInPhase };
          }).filter(g => g.tasksInPhase.length > 0);

          return (
            <div>
              <div className="text-xs text-text2 mb-3">Selecciona las tareas que deben completarse antes de <strong>{currentTask.title}</strong>:</div>
              {otherTasks.length === 0 ? (
                <div className="text-xs text-text3 py-4 text-center">No hay otras tareas en este cliente</div>
              ) : (
                <div className="max-h-[350px] overflow-y-auto">
                  {depPhaseGroups.map(({ pk, phInfo, tasksInPhase }) => (
                    <div key={pk} className="mb-2">
                      <div className="flex items-center gap-1.5 py-1.5 px-1 sticky top-0 bg-white z-[1]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: phInfo.color }} />
                        <span className="text-[11px] font-bold" style={{ color: phInfo.color }}>{phInfo.label}</span>
                      </div>
                      {tasksInPhase.map(t => {
                        const isChecked = currentDeps.includes(t.id);
                        const isDone = t.status === 'done';
                        return (
                          <label key={t.id} className={`flex items-center gap-2.5 py-1.5 px-3 pl-6 rounded-md cursor-pointer text-xs hover:bg-gray-50 ${isDone ? 'opacity-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const newDeps = isChecked ? currentDeps.filter(d => d !== t.id) : [...currentDeps, t.id];
                                updateTask(depsModal, { dependsOn: newDeps });
                              }}
                              className="cursor-pointer"
                            />
                            <span className={`flex-1 ${isDone ? 'line-through text-text3' : 'text-text'}`}>{t.title}</span>
                            {isDone && <span className="text-[9px] text-green-500 font-semibold">COMPLETADA</span>}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Eliminar cliente — modal de confirmacion (escribir nombre) */}
      <Modal
        open={deleteClientModal}
        onClose={() => setDeleteClientModal(false)}
        title="Eliminar cliente"
        maxWidth={460}
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setDeleteClientModal(false)}>Cancelar</button>
          <button
            className="py-2 px-4 rounded-md border-none bg-red-500 text-white text-[13px] cursor-pointer font-sans hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={deleteClientConfirmName.trim() !== c.name.trim()}
            onClick={async () => {
              await deleteClient(c.id);
              setDeleteClientModal(false);
              setSelectedId(null);
              setView('clients');
            }}
          >Eliminar definitivamente</button>
        </>}
      >
        <div className="text-[13px] text-gray-700 leading-relaxed">
          Esto va a borrar <strong>{c.name}</strong>, todas sus fases, todas sus tareas y todo su historial.
          La acción <strong>no se puede deshacer</strong>.
        </div>
        <div className="mt-3 text-[12px] text-gray-500">
          Para confirmar, escribí el nombre del cliente exacto:
        </div>
        <div className="mt-1 text-[11px] text-gray-400 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 inline-block">{c.name}</div>
        <input
          type="text"
          autoFocus
          value={deleteClientConfirmName}
          onChange={(e) => setDeleteClientConfirmName(e.target.value)}
          placeholder="Escribí el nombre del cliente"
          className="w-full mt-3 border border-gray-300 rounded-md py-2 px-3 text-[13px] font-sans outline-none focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]"
        />
      </Modal>

    </div>
  );
}
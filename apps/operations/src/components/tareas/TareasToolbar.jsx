import { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, Check, SlidersHorizontal, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Toolbar unificado de la sección Tareas: junta las PESTAÑAS + los filtros en
// UNA sola fila (antes eran 2: ViewToggle + TareasBar). Los toggles menos usados
// (ocultar completadas / solo sprint) viven en un menú "Filtros" para no saturar.
// El sprint y los KPIs viven en la fila 2 (dentro de cada vista).

const TAB_ICONS = {
  rendimiento: <><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="1" /><rect x="12" y="7" width="3" height="10" rx="1" /><rect x="17" y="13" width="3" height="4" rx="1" /></>,
  objetivos: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  sprint: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>,
  todo: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
};

export default function TareasToolbar({ view, setView, views = [], onlySprint, setOnlySprint }) {
  const {
    activeSprint, teamMembers, clients, taskAssignee, setTaskAssignee, taskClientFilter, setTaskClientFilter,
    closeSprint, hideCompletedTasks, setHideCompletedTasks,
  } = useApp();
  const isObj = view === 'objetivos';
  const isSprint = view === 'sprint';
  // Solo las vistas con tareas filtrables muestran los controles.
  const showFilters = isObj || isSprint || view === 'lista';

  const [personOpen, setPersonOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pRef = useRef(null);
  const cRef = useRef(null);
  const fRef = useRef(null);
  useEffect(() => {
    if (!personOpen && !clientOpen && !filtersOpen) return;
    const h = (e) => {
      if (personOpen && pRef.current && !pRef.current.contains(e.target)) setPersonOpen(false);
      if (clientOpen && cRef.current && !cRef.current.contains(e.target)) setClientOpen(false);
      if (filtersOpen && fRef.current && !fRef.current.contains(e.target)) setFiltersOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [personOpen, clientOpen, filtersOpen]);

  // Todos los clientes activos, incluido Korex/Empresa: eligiéndolo se ve lo
  // interno (lo que antes hacía el alcance "Internos").
  const scopeClients = (clients || []).filter(c => c.status !== 'completed');
  const selClient = (clients || []).find(c => c.id === taskClientFilter);
  const cInitials = (c) => (c?.name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const selMember = (teamMembers || []).find(m => m.name === taskAssignee);

  const trigger = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#3F4653', border: '1px solid #E2E5EB', borderRadius: 9, padding: '5px 10px', cursor: 'pointer', background: '#fff', whiteSpace: 'nowrap' };
  const activeFilters = (hideCompletedTasks ? 1 : 0) + (isObj && onlySprint ? 1 : 0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '7px 10px' }}>
      {/* Pestañas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#F0F2F5', borderRadius: 10, padding: 3 }}>
        {views.map(v => {
          const active = view === v.id;
          return (
            <span key={v.id} onClick={() => setView(v.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: active ? '#1A1D26' : '#6B7280', background: active ? '#FFFFFF' : 'transparent', boxShadow: active ? '0 1px 2px rgba(10,22,40,.06)' : 'none', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? '#5B7CF5' : '#9CA3AF'} strokeWidth="1.85">{TAB_ICONS[v.icon || v.id]}</svg>
              {v.label}
            </span>
          );
        })}
      </div>

      {/* Controles (solo en vistas con tareas) */}
      {showFilters && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Cliente */}
          <div ref={cRef} style={{ position: 'relative' }}>
            <span onClick={() => setClientOpen(v => !v)} style={trigger}>
              {selClient
                ? (selClient.avatarUrl
                  ? <img src={selClient.avatarUrl} alt={selClient.name} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                  : <span style={{ width: 20, height: 20, borderRadius: '50%', background: selClient.color || '#9CA3AF', color: '#fff', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cInitials(selClient)}</span>)
                : <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🏢</span>}
              <span style={{ whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selClient ? selClient.name : 'Cliente'}</span>
              <ChevronDown size={13} stroke="#9CA3AF" />
            </span>
            {clientOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 7px)', right: 0, zIndex: 30, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, boxShadow: '0 12px 32px rgba(10,22,40,.14)', padding: 6, minWidth: 240, maxHeight: 340, overflowY: 'auto' }}>
                <div onClick={() => { setTaskClientFilter('all'); setClientOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: taskClientFilter === 'all' ? '#F5F7FF' : 'transparent' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12 }}>🏢</span>
                  <span style={{ flex: 1, fontSize: 13, color: '#1A1D26' }}>Todos los clientes</span>
                  {taskClientFilter === 'all' && <Check size={15} stroke="#5B7CF5" strokeWidth={2.2} />}
                </div>
                {scopeClients.map(c => {
                  const active = taskClientFilter === c.id;
                  return (
                    <div key={c.id} onClick={() => { setTaskClientFilter(c.id); setClientOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: active ? '#F5F7FF' : 'transparent' }}>
                      {c.avatarUrl ? <img src={c.avatarUrl} alt={c.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: 24, height: 24, borderRadius: '50%', background: c.color || '#9CA3AF', color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{cInitials(c)}</span>}
                      <span style={{ flex: 1, fontSize: 13, color: '#1A1D26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                      {active && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B7CF5" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Encargado */}
          <div ref={pRef} style={{ position: 'relative' }}>
            <span onClick={() => setPersonOpen(v => !v)} style={trigger}>
              {selMember
                ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: selMember.color || '#9CA3AF', color: '#fff', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(selMember.initials || selMember.name?.slice(0, 2) || '').toUpperCase()}</span>
                : <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={12} stroke="#5B7CF5" strokeWidth={1.9} /></span>}
              <span style={{ whiteSpace: 'nowrap' }}>{selMember ? selMember.name.split(' ')[0] : 'Encargado'}</span>
              <ChevronDown size={13} stroke="#9CA3AF" />
            </span>
            {personOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 7px)', right: 0, zIndex: 30, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, boxShadow: '0 12px 32px rgba(10,22,40,.14)', padding: 6, minWidth: 224, maxHeight: 320, overflowY: 'auto' }}>
                {[{ id: 'all', name: 'Todos los encargados' }, ...(teamMembers || [])].map(m => {
                  const isAll = m.id === 'all';
                  const active = isAll ? taskAssignee === 'all' : taskAssignee === m.name;
                  return (
                    <div key={m.id} onClick={() => { setTaskAssignee(isAll ? 'all' : m.name); setPersonOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: active ? '#F5F7FF' : 'transparent' }}>
                      {isAll
                        ? <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={14} stroke="#5B7CF5" strokeWidth={1.9} /></span>
                        : <span style={{ width: 24, height: 24, borderRadius: '50%', background: m.color || '#9CA3AF', color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{(m.initials || m.name?.slice(0, 2) || '').toUpperCase()}</span>}
                      <span style={{ flex: 1, fontSize: 13, color: '#1A1D26', whiteSpace: 'nowrap' }}>{m.name}</span>
                      {active && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B7CF5" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filtros (toggles) */}
          <div ref={fRef} style={{ position: 'relative' }}>
            <span onClick={() => setFiltersOpen(v => !v)} style={{ ...trigger, background: activeFilters ? '#EEF2FF' : '#fff', borderColor: activeFilters ? '#C7D2FE' : '#E2E5EB', color: activeFilters ? '#4A67D8' : '#3F4653' }}>
              <SlidersHorizontal size={14} stroke={activeFilters ? '#5B7CF5' : '#9CA3AF'} />
              <span style={{ whiteSpace: 'nowrap' }}>Filtros{activeFilters ? ` · ${activeFilters}` : ''}</span>
            </span>
            {filtersOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 7px)', right: 0, zIndex: 30, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, boxShadow: '0 12px 32px rgba(10,22,40,.14)', padding: 6, minWidth: 220 }}>
                <div onClick={() => setHideCompletedTasks(!hideCompletedTasks)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 8, cursor: 'pointer' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: hideCompletedTasks ? 'none' : '1.5px solid #D0D5DD', background: hideCompletedTasks ? '#5B7CF5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{hideCompletedTasks && <Check size={12} stroke="#fff" strokeWidth={3} />}</span>
                  <span style={{ fontSize: 13, color: '#1A1D26' }}>Ocultar completadas</span>
                </div>
                {isObj && (
                  <div onClick={() => setOnlySprint(!onlySprint)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 8, cursor: 'pointer' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, border: onlySprint ? 'none' : '1.5px solid #D0D5DD', background: onlySprint ? '#5B7CF5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{onlySprint && <Check size={12} stroke="#fff" strokeWidth={3} />}</span>
                    <Zap size={13} fill="#5B7CF5" stroke="none" />
                    <span style={{ fontSize: 13, color: '#1A1D26' }}>Solo en el sprint</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {isSprint && activeSprint && (
            <span onClick={() => { if (window.confirm('Cerrar el sprint en curso: lo no terminado pasa al sprint siguiente y se archiva el resumen. ¿Continuar?')) closeSprint(); }}
              style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#5B7CF5', borderRadius: 9, padding: '6px 13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Cerrar sprint</span>
          )}
        </div>
      )}
    </div>
  );
}

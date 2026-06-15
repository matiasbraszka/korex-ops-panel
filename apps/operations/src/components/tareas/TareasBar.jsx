import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, User, Check, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { sprintDaysLeft } from '../../utils/helpers';

// Barra de contexto del diseño: alcance (Clientes/Internos), navegación de mes
// o info del sprint, "En el sprint", filtro por persona y cerrar sprint.
export default function TareasBar({ view, scope, setScope, onlySprint, setOnlySprint }) {
  const { activeSprint, teamMembers, clients, taskAssignee, setTaskAssignee, taskClientFilter, setTaskClientFilter, closeSprint, hideCompletedTasks, setHideCompletedTasks } = useApp();
  const isObj = view === 'objetivos';
  const isSprint = view === 'sprint';

  const [personOpen, setPersonOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const pRef = useRef(null);
  const cRef = useRef(null);
  useEffect(() => {
    if (!personOpen && !clientOpen) return;
    const h = (e) => {
      if (personOpen && pRef.current && !pRef.current.contains(e.target)) setPersonOpen(false);
      if (clientOpen && cRef.current && !cRef.current.contains(e.target)) setClientOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [personOpen, clientOpen]);

  // Clientes del alcance actual (Clientes vs Internos) para el filtro.
  const isKorex = (c) => /empresa|korex/i.test(c?.name || '');
  const scopeClients = (clients || []).filter(c => c.status !== 'completed').filter(c => (scope === 'int' ? isKorex(c) : !isKorex(c)));
  const selClient = (clients || []).find(c => c.id === taskClientFilter);
  const cInitials = (c) => (c?.name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const selMember = (teamMembers || []).find(m => m.name === taskAssignee);
  const monthLabel = (() => { const s = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); })();
  const daysLeft = sprintDaysLeft(activeSprint);

  const seg = (active) => ({ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7, cursor: 'pointer', background: active ? '#FFFFFF' : 'transparent', color: active ? '#1A1D26' : '#6B7280', boxShadow: active ? '0 1px 2px rgba(10,22,40,.08)' : 'none' });
  const navBtn = { display: 'flex', width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 6, color: '#6B7280' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '9px 14px' }}>
      {/* IZQUIERDA */}
      {isObj && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid #E2E5EB', borderRadius: 9, padding: 3 }}>
          <span style={navBtn}><ChevronLeft size={15} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, padding: '0 8px', whiteSpace: 'nowrap' }}>{monthLabel}</span>
          <span style={navBtn}><ChevronRight size={15} /></span>
        </div>
      )}
      {isSprint && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{activeSprint?.name || 'Sin sprint'}</span>
          {activeSprint && <span style={{ fontSize: 13, color: '#9CA3AF' }}>{activeSprint.startDate} → {activeSprint.endDate}</span>}
          {daysLeft != null && <span style={{ fontSize: 11, fontWeight: 600, color: '#B45309', background: '#FFF7ED', borderRadius: 999, padding: '3px 11px' }}>quedan {daysLeft} {daysLeft === 1 ? 'día' : 'días'}</span>}
        </div>
      )}

      {/* DERECHA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#F0F2F5', borderRadius: 9, padding: 3 }}>
          <span onClick={() => setScope('cli')} style={seg(scope === 'cli')}>Clientes</span>
          <span onClick={() => setScope('int')} style={seg(scope === 'int')}>Internos</span>
        </div>

        {isObj && (
          <>
            <div style={{ width: 1, height: 24, background: '#E2E5EB' }} />
            <span onClick={() => setOnlySprint(!onlySprint)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: '#3F4653', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: onlySprint ? 'none' : '1.5px solid #D0D5DD', background: onlySprint ? '#5B7CF5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {onlySprint && <Check size={12} stroke="#fff" strokeWidth={3} />}
              </span>
              <Zap size={13} fill="#5B7CF5" stroke="none" />En el sprint
            </span>
          </>
        )}

        <span onClick={() => setHideCompletedTasks(!hideCompletedTasks)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: '#3F4653', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, border: hideCompletedTasks ? 'none' : '1.5px solid #D0D5DD', background: hideCompletedTasks ? '#5B7CF5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {hideCompletedTasks && <Check size={12} stroke="#fff" strokeWidth={3} />}
          </span>
          Ocultar completadas
        </span>

        <div ref={cRef} style={{ position: 'relative' }}>
          <span onClick={() => setClientOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3F4653', border: '1px solid #E2E5EB', borderRadius: 9, padding: '5px 10px', cursor: 'pointer', background: '#fff' }}>
            {selClient
              ? (selClient.avatarUrl
                ? <img src={selClient.avatarUrl} alt={selClient.name} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                : <span style={{ width: 22, height: 22, borderRadius: '50%', background: selClient.color || '#9CA3AF', color: '#fff', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cInitials(selClient)}</span>)
              : <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🏢</span>}
            <span style={{ whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selClient ? selClient.name : 'Cliente'}</span>
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

        <div ref={pRef} style={{ position: 'relative' }}>
          <span onClick={() => setPersonOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3F4653', border: '1px solid #E2E5EB', borderRadius: 9, padding: '5px 10px', cursor: 'pointer', background: '#fff' }}>
            {selMember ? (
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: selMember.color || '#9CA3AF', color: '#fff', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(selMember.initials || selMember.name?.slice(0, 2) || '').toUpperCase()}</span>
            ) : (
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={13} stroke="#5B7CF5" strokeWidth={1.9} /></span>
            )}
            <span style={{ whiteSpace: 'nowrap' }}>{selMember ? selMember.name : 'Encargado'}</span>
            <ChevronDown size={13} stroke="#9CA3AF" />
          </span>
          {personOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 7px)', right: 0, zIndex: 30, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, boxShadow: '0 12px 32px rgba(10,22,40,.14)', padding: 6, minWidth: 224, maxHeight: 320, overflowY: 'auto' }}>
              {[{ id: 'all', name: 'Todos los encargados' }, ...(teamMembers || [])].map(m => {
                const isAll = m.id === 'all';
                const active = isAll ? taskAssignee === 'all' : taskAssignee === m.name;
                return (
                  <div key={m.id} onClick={() => { setTaskAssignee(isAll ? 'all' : m.name); setPersonOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: active ? '#F5F7FF' : 'transparent' }}>
                    {isAll ? (
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={14} stroke="#5B7CF5" strokeWidth={1.9} /></span>
                    ) : (
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: m.color || '#9CA3AF', color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{(m.initials || m.name?.slice(0, 2) || '').toUpperCase()}</span>
                    )}
                    <span style={{ flex: 1, fontSize: 13, color: '#1A1D26', whiteSpace: 'nowrap' }}>{m.name}</span>
                    {active && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B7CF5" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isSprint && activeSprint && (
          <span onClick={() => { if (window.confirm('Cerrar el sprint en curso: lo no terminado pasa al sprint siguiente y se archiva el resumen. ¿Continuar?')) closeSprint(); }}
            style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#5B7CF5', borderRadius: 9, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Cerrar sprint</span>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, AlertCircle, CheckCircle2, Hammer, Play, Rocket, Map, ClipboardList, Clock } from 'lucide-react';
import { Screen, Card, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { INTRO_VIDEO } from '../data/mockData';

const STAGES = ['Guion', 'Grabación', 'Edición', 'Publicado'];
// Colores de prioridad de la tarea (misma semántica que el panel del equipo).
const PRIO = {
  alta:    { label: 'Urgente', bg: '#FEF2F2', color: '#DC2626' },
  high:    { label: 'Urgente', bg: '#FEF2F2', color: '#DC2626' },
  urgente: { label: 'Urgente', bg: '#FEF2F2', color: '#DC2626' },
  normal:  { label: 'Normal', bg: '#EEF2FF', color: '#4F63C4' },
  baja:    { label: 'Cuando puedas', bg: '#F0F2F5', color: '#6B7280' },
};

// Home = lo que necesitamos de vos (arriba de todo) + tus funnels.
export default function InicioScreen() {
  const nav = useNavigate();
  const { data: me } = useAsync(() => api.me(), []);
  const { data, loading } = useAsync(() => api.funnels(), []);
  const { data: tareasData } = useAsync(() => api.tareas(), []);
  const [playing, setPlaying] = useState(false);
  const [tareasOpen, setTareasOpen] = useState(false); // desplegable de tareas pendientes

  if (loading) return <Loading label="Cargando tus funnels…" />;
  const funnels = Array.isArray(data) ? data : [];
  const tareas = Array.isArray(tareasData) ? tareasData : [];
  const nombre = (me?.name || me?.clientName || '').split(' ')[0];
  // Próximo a lanzar: 1) el marcado como prioridad desde el panel; si no hay,
  // 2) el primer funnel en construcción según el orden del panel.
  const nextId = funnels.find((f) => f.esPrioridad)?.id
    || funnels.find((f) => f.status === 'borrador')?.id;
  // Funnels que además tienen pendientes propios (material que falta).
  const funnelsConPend = funnels.filter((f) => (f.pendientes || 0) > 0);
  const hayUrgente = tareas.length > 0 || funnelsConPend.length > 0;

  return (
    <Screen>
      {isDemo() && <DemoBanner />}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280' }}>Hola{nombre ? `, ${nombre}` : ''} 👋</div>
      <h1 style={{ margin: '2px 0 6px', fontSize: 30, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.03em' }}>¡Bienvenido!</h1>
      <p style={{ margin: '0 0 18px', fontSize: 15, color: '#6B7280', lineHeight: 1.45 }}>Esta es tu plataforma de Método Korex.</p>

      {/* ── LO QUE NECESITAMOS DE VOS: lo urgente, arriba de todo ── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <ClipboardList size={19} color={hayUrgente ? '#B45309' : '#059669'} />
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>Lo que necesitamos de vos</h2>
        </div>
        {!hayUrgente ? (
          <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={20} color="#22C55E" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 14.5, fontWeight: 600, color: '#1A1D26' }}>¡Estás al día! No te falta nada por ahora.</span>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Tus tareas: desplegable tipo checklist. Las marca el EQUIPO cuando las
                valida (por eso los círculos no se tocan): al validarse desaparecen. */}
            {tareas.length > 0 && (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div onClick={() => setTareasOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 16px', cursor: 'pointer' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ClipboardList size={19} color="#5B7CF5" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1A1D26' }}>
                      Tenés {tareas.length} {tareas.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#9CA3AF' }}>Tocá para {tareasOpen ? 'cerrar' : 'ver'} la lista</div>
                  </div>
                  <ChevronRight size={19} color="#9CA3AF" style={{ flexShrink: 0, transform: tareasOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                </div>
                {tareasOpen && (
                  <div style={{ borderTop: '1px solid #F0F2F5', padding: '4px 16px 10px' }}>
                    {tareas.map((t, i) => {
                      const p = PRIO[String(t.prioridad || 'normal').toLowerCase()] || PRIO.normal;
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 0', borderTop: i === 0 ? 'none' : '1px solid #F5F6F8' }}>
                          {/* Checklist de solo lectura: lo tildamos nosotros al validar. */}
                          <span style={{ width: 21, height: 21, borderRadius: 7, border: '2px solid #D0D5DD', background: '#fff', flexShrink: 0, marginTop: 1 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1A1D26', lineHeight: 1.3 }}>{t.titulo}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: p.bg, color: p.color }}>{p.label}</span>
                              {t.funnel && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#EEF2FF', color: '#4F63C4' }}>{t.funnel}</span>}
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>
                                <Clock size={11} /> {t.dias === 0 ? 'hoy' : t.dias === 1 ? 'hace 1 día' : `hace ${t.dias} días`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
            {funnelsConPend.map((f) => (
              <Card key={'p' + f.id} onClick={() => nav(`/funnel/${f.id}`)} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <AlertCircle size={18} color="#B45309" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#78350F' }}>Falta material en <b>{f.name}</b> — tocá para verlo</span>
                <ChevronRight size={18} color="#D97706" style={{ flexShrink: 0 }} />
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Video "cómo usar": compacto; se expande al tocarlo. */}
      {playing && INTRO_VIDEO ? (
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#0A0A0A', aspectRatio: '16 / 9', marginBottom: 22 }}>
          <video controls autoPlay playsInline src={INTRO_VIDEO} style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        </div>
      ) : (
        <Card onClick={() => setPlaying(true)} style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Play size={18} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1A1D26' }}>¿Primera vez acá?</div>
            <div style={{ fontSize: 12.5, color: '#9CA3AF' }}>Mirá cómo usar la plataforma · 2 min</div>
          </div>
          <ChevronRight size={18} color="#C4C9D4" style={{ flexShrink: 0 }} />
        </Card>
      )}

      {/* Avance del proyecto: la vista "en qué punto estamos" completa, con fechas. */}
      <Card onClick={() => nav('/avance')} style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 13, marginBottom: 22 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Map size={23} color="#5B7CF5" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: '#1A1D26', lineHeight: 1.2 }}>Avance de tu proyecto</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Mirá en qué etapa estamos y qué sigue</div>
        </div>
        <ChevronRight size={20} color="#C4C9D4" style={{ flexShrink: 0 }} />
      </Card>

      {/* Sección: tus funnels */}
      <h2 style={{ margin: '4px 0 4px', fontSize: 21, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>Tus funnels</h2>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6B7280', lineHeight: 1.4 }}>Los proyectos que estamos armando con vos. Tocá uno para ver sus guiones y lo que falta.</p>

      {funnels.length === 0 ? (
        <Card style={{ padding: 22, textAlign: 'center', color: '#6B7280' }}>
          Todavía no tenés funnels asignados. En cuanto arranquemos uno, va a aparecer acá.
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {funnels.map((f) => (
            <FunnelCard key={f.id} f={f} isNext={f.id === nextId} onOpen={() => nav(`/funnel/${f.id}`)} />
          ))}
        </div>
      )}
    </Screen>
  );
}

function FunnelCard({ f, isNext, onOpen }) {
  const pend = f.pendientes || 0;
  const enConstruccion = f.status === 'borrador';
  const etapa = f.etapa || (f.status === 'activa' ? 4 : (f.guionesTotal ? 2 : 1));

  return (
    <Card onClick={onOpen} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, border: isNext ? '1px solid #C7D2FE' : undefined, boxShadow: isNext ? '0 2px 10px rgba(91,124,245,.10)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, ...chip(enConstruccion) }}>
              {enConstruccion ? <Hammer size={12} /> : <CheckCircle2 size={12} />} {f.estadoLabel || (enConstruccion ? 'En construcción' : 'Activo')}
            </span>
            {isNext && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, background: '#5B7CF5', color: '#FFFFFF' }}>
                <Rocket size={12} /> Próximo a lanzar
              </span>
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D26', lineHeight: 1.25, letterSpacing: '-0.01em' }}>{f.name}</div>
        </div>
        <ChevronRight size={22} color="#C4C9D4" style={{ flexShrink: 0, marginTop: 2 }} />
      </div>

      {/* Mini-pipeline del funnel */}
      <Stepper etapa={etapa} />

      {pend > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '9px 12px' }}>
          <AlertCircle size={16} /> Tenés cosas para enviarnos
        </div>
      )}
    </Card>
  );
}

function Stepper({ etapa = 1 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {STAGES.map((label, i) => {
        const n = i + 1;
        const done = n < etapa;
        const current = n === etapa;
        const on = done || current;
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div style={{ position: 'absolute', top: 6, left: '-50%', width: '100%', height: 2, background: n <= etapa ? '#5B7CF5' : '#E5E7EB' }} />
            )}
            <div style={{ width: 14, height: 14, borderRadius: 999, zIndex: 1, background: on ? '#5B7CF5' : '#FFFFFF', border: `2px solid ${on ? '#5B7CF5' : '#D0D5DD'}`, boxShadow: current ? '0 0 0 4px rgba(91,124,245,.18)' : 'none' }} />
            <div style={{ fontSize: 10.5, fontWeight: current ? 800 : 600, color: current ? '#1A1D26' : done ? '#5B7CF5' : '#9CA3AF', marginTop: 6, textAlign: 'center', lineHeight: 1.1 }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function chip(enConstruccion) {
  return enConstruccion
    ? { background: '#FFF7ED', color: '#C2410C' }
    : { background: '#ECFDF5', color: '#059669' };
}

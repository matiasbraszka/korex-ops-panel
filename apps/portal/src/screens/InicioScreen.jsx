import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, AlertCircle, CheckCircle2, Play, Clock, ClipboardList, Layers, ArrowRight } from 'lucide-react';
import { Screen, Card, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { INTRO_VIDEO } from '../data/mockData';
import { destinoTarea } from '../data/taskNav';

// Colores de prioridad de la tarea (misma semántica que el panel del equipo).
const PRIO = {
  alta:    { label: 'Urgente', bg: '#FEF2F2', color: '#DC2626' },
  high:    { label: 'Urgente', bg: '#FEF2F2', color: '#DC2626' },
  urgente: { label: 'Urgente', bg: '#FEF2F2', color: '#DC2626' },
  normal:  { label: 'Normal', bg: '#EEF2FF', color: '#4F63C4' },
  baja:    { label: 'Cuando puedas', bg: '#F0F2F5', color: '#6B7280' },
};

// Home = dashboard: hero con el estado del proyecto + tareas pendientes accionables.
// Cada tarea viene del sistema de operaciones enlazada a un funnel: tocarla lleva
// adentro de ese funnel (a Guiones si es de grabar, a Recursos si es de subir).
export default function InicioScreen() {
  const nav = useNavigate();
  const { data: me } = useAsync(() => api.me(), []);
  const { data, loading } = useAsync(() => api.funnels(), []);
  const { data: tareasData } = useAsync(() => api.tareas(), []);
  const { data: pipe } = useAsync(() => api.pipeline(), []);
  const [playing, setPlaying] = useState(false);

  if (loading) return <Loading label="Cargando tu proyecto…" />;
  const funnels = Array.isArray(data) ? data : [];
  const tareas = Array.isArray(tareasData) ? tareasData : [];
  const nombre = (me?.name || me?.clientName || '').split(' ')[0];
  const progreso = pipe?.todosTerminados ? 100 : (pipe?.progreso ?? null);
  const activos = funnels.filter((f) => f.status === 'activa').length;
  const funnelsConPend = funnels.filter((f) => (f.pendientes || 0) > 0);
  const atencion = tareas.length + funnelsConPend.length;

  return (
    <Screen>
      {isDemo() && <DemoBanner />}

      {/* ── HERO oscuro: el estado del proyecto de un vistazo ── */}
      <div style={{ background: '#0A0A0A', borderRadius: 22, padding: '22px 20px', marginBottom: 14 }}>
        <div style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A5B4FC', background: 'rgba(91,124,245,.18)', padding: '4px 10px', borderRadius: 999, marginBottom: 12 }}>Tu proyecto</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em', lineHeight: 1.1 }}>Hola{nombre ? `, ${nombre}` : ''}.</h1>
        <p style={{ margin: 0, fontSize: 15, color: '#C7CBD4', lineHeight: 1.5 }}>
          {progreso != null ? <>Tu proyecto va al <b style={{ color: '#FFFFFF' }}>{progreso}%</b>. </> : null}
          {atencion > 0
            ? <>{atencion === 1 ? 'Hay 1 cosa que necesita' : `Hay ${atencion} cosas que necesitan`} tu atención hoy.</>
            : <>Estás al día: no necesitamos nada de ti por ahora.</>}
        </p>
      </div>

      {/* Stats rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <Card onClick={() => nav('/funnels')} style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>{activos}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginTop: 2 }}>
            <Layers size={12} /> Funnels activos
          </div>
        </Card>
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: tareas.length > 0 ? '#B45309' : '#1A1D26', letterSpacing: '-0.02em' }}>{tareas.length}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginTop: 2 }}>
            <ClipboardList size={12} /> Tareas pendientes
          </div>
        </Card>
      </div>

      {/* ── TAREAS PENDIENTES: tarjetas accionables ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>Tareas pendientes</h2>
        <button onClick={() => nav('/funnels')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5B7CF5' }}>
          Ver funnels <ChevronRight size={14} />
        </button>
      </div>

      {tareas.length === 0 && funnelsConPend.length === 0 ? (
        <Card style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <CheckCircle2 size={20} color="#22C55E" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 14.5, fontWeight: 600, color: '#1A1D26' }}>¡Estás al día! No tienes tareas pendientes.</span>
        </Card>
      ) : (
        <div className="mk-grid2" style={{ marginBottom: 24 }}>
          {/* Las tareas las valida el EQUIPO en operaciones: cuando se completan, desaparecen solas. */}
          {tareas.map((t) => <TareaCard key={t.id} t={t} nav={nav} />)}
          {funnelsConPend.map((f) => (
            <Card key={'p' + f.id} onClick={() => nav(`/funnel/${f.id}`, { state: { focus: 'recursos' } })} style={{ padding: 16, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AlertCircle size={18} color="#B45309" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: '#78350F', lineHeight: 1.35 }}>Falta material en <b>{f.name}</b></div>
              </div>
              <button style={{ ...ctaBtn, background: '#B45309', marginTop: 12 }}>Subir material <ArrowRight size={15} /></button>
            </Card>
          ))}
        </div>
      )}

      {/* Video "cómo usar": compacto; se expande al tocarlo. */}
      {playing && INTRO_VIDEO ? (
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#0A0A0A', aspectRatio: '16 / 9', marginBottom: 8 }}>
          <video controls autoPlay playsInline src={INTRO_VIDEO} style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        </div>
      ) : (
        <Card onClick={() => setPlaying(true)} style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Play size={18} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1A1D26' }}>¿Primera vez aquí?</div>
            <div style={{ fontSize: 12.5, color: '#9CA3AF' }}>Mira cómo usar la plataforma · 2 min</div>
          </div>
          <ChevronRight size={18} color="#C4C9D4" style={{ flexShrink: 0 }} />
        </Card>
      )}
    </Screen>
  );
}

// Tarjeta de tarea: título + funnel + prioridad + hace cuánto, con un botón que
// lleva al lugar exacto (guiones si es de grabar, recursos si es de subir).
function TareaCard({ t, nav }) {
  const p = PRIO[String(t.prioridad || 'normal').toLowerCase()] || PRIO.normal;
  const dest = destinoTarea(t);
  const abrir = dest ? () => nav(dest.to, { state: dest.state }) : undefined;
  return (
    <Card onClick={abrir} style={{ padding: 16 }}>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1A1D26', lineHeight: 1.3 }}>{t.titulo}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: p.bg, color: p.color }}>{p.label}</span>
        {t.funnel && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#EEF2FF', color: '#4F63C4' }}>{t.funnel}</span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>
          <Clock size={11} /> {t.dias === 0 ? 'hoy' : t.dias === 1 ? 'hace 1 día' : `hace ${t.dias} días`}
        </span>
      </div>
      {dest && <button style={{ ...ctaBtn, marginTop: 12 }}>{dest.cta} <ArrowRight size={15} /></button>}
    </Card>
  );
}

const ctaBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  width: '100%', border: 'none', borderRadius: 999, background: '#0A0A0A', color: '#FFFFFF',
  fontSize: 13.5, fontWeight: 800, letterSpacing: '0.02em', padding: '11px 18px', cursor: 'pointer',
};

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, AlertCircle, CheckCircle2, Hammer, Play, Rocket } from 'lucide-react';
import { Screen, Card, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { INTRO_VIDEO } from '../data/mockData';

const STAGES = ['Guion', 'Grabación', 'Edición', 'Publicado'];

// Home = tus funnels. Entrás a uno para ver sus guiones y lo que falta.
export default function InicioScreen() {
  const nav = useNavigate();
  const { data: me } = useAsync(() => api.me(), []);
  const { data, loading } = useAsync(() => api.funnels(), []);
  const [playing, setPlaying] = useState(false);

  if (loading) return <Loading label="Cargando tus funnels…" />;
  const funnels = Array.isArray(data) ? data : [];
  const nombre = (me?.name || me?.clientName || '').split(' ')[0];
  // Próximo a lanzar: 1) el marcado como prioridad desde el panel; si no hay,
  // 2) el primer funnel en construcción según el orden del panel.
  const nextId = funnels.find((f) => f.esPrioridad)?.id
    || funnels.find((f) => f.status === 'borrador')?.id;

  return (
    <Screen>
      {isDemo() && <DemoBanner />}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280' }}>Hola{nombre ? `, ${nombre}` : ''} 👋</div>
      <h1 style={{ margin: '2px 0 6px', fontSize: 30, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.03em' }}>¡Bienvenido!</h1>
      <p style={{ margin: '0 0 18px', fontSize: 15, color: '#6B7280', lineHeight: 1.45 }}>Esta es tu plataforma de Método Korex. Mirá el video para arrancar y después entrá a tus funnels.</p>

      {/* Video: cómo usar la plataforma */}
      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#0A0A0A', aspectRatio: '16 / 9', marginBottom: 22 }}>
        {playing && INTRO_VIDEO ? (
          <video controls autoPlay playsInline src={INTRO_VIDEO} style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        ) : (
          <div onClick={() => setPlaying(true)} style={{ position: 'absolute', inset: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 120% at 50% 0%, rgba(91,124,245,.28), transparent 60%)' }} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 66, height: 66, borderRadius: 999, background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(6px)', border: '1.5px solid rgba(255,255,255,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={27} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 4 }} />
              </div>
              <div style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>Cómo usar la plataforma</div>
            </div>
            <div style={{ position: 'absolute', top: 12, left: 14, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>Video · 2 min</div>
          </div>
        )}
      </div>

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

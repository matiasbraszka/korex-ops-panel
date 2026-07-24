import { useNavigate } from 'react-router-dom';
import { ChevronRight, AlertCircle, CheckCircle2, Hammer, Rocket, Trophy, Check, ArrowRight } from 'lucide-react';
import { Screen, Card, Progress, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';

// Las mismas 4 etapas del pipeline del sistema de operaciones.
const STAGES = ['Guion', 'Grabación', 'Edición', 'Publicado'];

// Tab Funnels: cada funnel con su pipeline simple (el mismo que ve el equipo).
export default function FunnelsScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.funnels(), []);
  const { data: pipe } = useAsync(() => api.pipeline(), []);

  if (loading) return <Loading label="Cargando tus funnels…" />;
  const funnels = Array.isArray(data) ? data : [];
  const activos = funnels.filter((f) => f.status === 'activa').length;
  const enObra = funnels.length - activos;
  const terminado = pipe?.todosTerminados === true;
  const progreso = terminado ? 100 : (pipe?.progreso ?? 0);
  const nextId = funnels.find((f) => f.esPrioridad)?.id
    || funnels.find((f) => f.status === 'borrador')?.id;

  return (
    <Screen>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.03em' }}>Tus funnels</h1>
      <p style={{ margin: '0 0 16px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Los proyectos que estamos armando contigo, con su avance real.</p>

      {/* Stats rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Card style={{ padding: '13px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF' }}>Activos</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: '#059669', letterSpacing: '-0.02em' }}>{String(activos).padStart(2, '0')}</div>
        </Card>
        <Card style={{ padding: '13px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF' }}>En construcción</div>
          <div style={{ fontSize: 25, fontWeight: 800, color: enObra > 0 ? '#C2410C' : '#1A1D26', letterSpacing: '-0.02em' }}>{String(enObra).padStart(2, '0')}</div>
        </Card>
      </div>

      {/* Progreso general = promedio del avance real de los funnels. */}
      {terminado ? (
        <Card style={{ padding: 18, marginBottom: 24, background: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trophy size={22} color="#FFFFFF" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#065F46', lineHeight: 1.25 }}>Funnels todos terminados</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#059669', marginTop: 2 }}>Ahora, optimizando los resultados</div>
          </div>
          <span style={{ fontSize: 21, fontWeight: 800, color: '#059669', flexShrink: 0 }}>100%</span>
        </Card>
      ) : funnels.length > 0 && (
        <Card style={{ padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1D26' }}>Progreso general</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#5B7CF5', letterSpacing: '-0.02em' }}>{progreso}%</span>
          </div>
          <Progress value={progreso} color="#5B7CF5" height={10} />
        </Card>
      )}

      {funnels.length === 0 ? (
        <Card style={{ padding: 22, textAlign: 'center', color: '#6B7280' }}>
          Todavía no tienes funnels asignados. En cuanto arranquemos uno, va a aparecer aquí.
        </Card>
      ) : (
        <div className="mk-grid2">
          {funnels.map((f) => (
            <FunnelCard key={f.id} f={f} isNext={f.id === nextId} nav={nav} />
          ))}
        </div>
      )}
    </Screen>
  );
}

function FunnelCard({ f, isNext, nav }) {
  const pend = f.pendientes || 0;
  const enConstruccion = f.status === 'borrador';
  const etapa = f.etapa || (f.status === 'activa' ? 4 : (f.guionesTotal ? 2 : 1));

  return (
    <Card onClick={() => nav(`/funnel/${f.id}`)} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 15, border: isNext ? '1px solid #C7D2FE' : undefined, boxShadow: isNext ? '0 2px 10px rgba(91,124,245,.10)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {pend > 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, background: '#FEF2F2', color: '#DC2626' }}>Acción pendiente</span>
            )}
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

      {/* El pipeline simple del sistema de operaciones: Guion → Grabación → Edición → Publicado */}
      <Stepper etapa={etapa} publicado={f.status === 'activa'} />

      {pend > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 600, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 12px', lineHeight: 1.4 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><b>Acción pendiente:</b> falta material tuyo para poder avanzar con este funnel.</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); nav(`/funnel/${f.id}`, { state: { focus: 'recursos' } }); }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', border: 'none', borderRadius: 999, background: '#0A0A0A', color: '#FFFFFF', fontSize: 13.5, fontWeight: 800, padding: '11px 18px', cursor: 'pointer', marginTop: 10 }}
          >
            Subir material <ArrowRight size={15} />
          </button>
        </div>
      )}
    </Card>
  );
}

// Stepper de 4 pasos: los hechos con tilde, el actual resaltado.
function Stepper({ etapa = 1, publicado = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {STAGES.map((label, i) => {
        const n = i + 1;
        const done = n < etapa || (publicado && n <= etapa);
        const current = !done && n === etapa;
        const on = done || current;
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div style={{ position: 'absolute', top: 9, left: '-50%', width: '100%', height: 2, background: n <= etapa ? '#5B7CF5' : '#E5E7EB' }} />
            )}
            <div style={{ width: 20, height: 20, borderRadius: 999, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? '#5B7CF5' : '#FFFFFF', border: `2px solid ${on ? '#5B7CF5' : '#D0D5DD'}`, boxShadow: current ? '0 0 0 4px rgba(91,124,245,.18)' : 'none' }}>
              {done && <Check size={12} color="#FFFFFF" strokeWidth={3.5} />}
              {current && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#FFFFFF' }} />}
            </div>
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

import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Circle, ChevronLeft, Upload, Undo2, FileText, ClipboardCheck } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { Screen, Card, Progress, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';

// Ícono por tipo de movimiento del historial.
const MOV_ICON = {
  subida:     { Icon: Upload, color: '#2E69E0', bg: '#EEF2FF' },
  devolucion: { Icon: Undo2, color: '#059669', bg: '#ECFDF5' },
  guion:      { Icon: FileText, color: '#8B5CF6', bg: '#F5F3FF' },
  tarea:      { Icon: ClipboardCheck, color: '#B45309', bg: '#FEF3C7' },
};

const ESTADO = {
  hecho:     { color: '#16A34A', bg: '#22C55E', ring: '#86EFAC', label: 'Listo' },
  en_curso:  { color: '#2E69E0', bg: '#5B7CF5', ring: '#B9C4E8', label: 'En curso' },
  pendiente: { color: '#9CA3AF', bg: '#FFFFFF', ring: '#E2E5EB', label: 'Pendiente' },
};

// Pantalla propia (con "Volver"), enlazada desde la tarjeta "Avance" del Inicio.
export default function PipelineScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.pipeline(), []);
  const { data: movs } = useAsync(() => api.movimientos(), []);
  const fases = data?.fases || [];
  const progreso = data?.progreso ?? 0;
  const movimientos = Array.isArray(movs) ? movs : [];

  return (
    <PhoneFrame>
      <div style={{ position: 'sticky', top: 0, background: '#F7F8FA', padding: '14px 18px 10px', zIndex: 10 }}>
        <button onClick={() => nav('/')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#5B7CF5', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}>
          <ChevronLeft size={20} /> Inicio
        </button>
      </div>
      {loading ? <Loading label="Cargando el avance…" /> : (
    <Screen>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.03em' }}>Avance de tu proyecto</h1>
      <p style={{ margin: '0 0 18px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Estas son las etapas de tu proyecto y sus fechas. Así ves en qué estamos y qué sigue.</p>

      <Card style={{ padding: 18, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D26' }}>Progreso general</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#5B7CF5', letterSpacing: '-0.02em' }}>{progreso}%</span>
        </div>
        <Progress value={progreso} color="#5B7CF5" height={12} />
      </Card>

      <div style={{ position: 'relative', paddingLeft: 4 }}>
        {fases.map((f, i) => {
          const e = ESTADO[f.estado] || ESTADO.pendiente;
          const last = i === fases.length - 1;
          return (
            <div key={f.id} style={{ display: 'flex', gap: 14, position: 'relative' }}>
              {/* Columna del hito + línea */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: 999, background: e.bg, border: `2px solid ${e.ring}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {f.estado === 'hecho' ? <Check size={17} color="#FFFFFF" strokeWidth={3.5} />
                    : f.estado === 'en_curso' ? <Loader2 size={16} color="#FFFFFF" className="mk-spin" />
                    : <Circle size={9} color="#C4C9D4" fill="#C4C9D4" />}
                </div>
                {!last && <div style={{ width: 2, flex: 1, minHeight: 26, background: f.estado === 'hecho' ? '#86EFAC' : '#E2E5EB', margin: '2px 0' }} />}
              </div>
              {/* Contenido */}
              <div style={{ flex: 1, paddingBottom: last ? 0 : 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: f.estado === 'pendiente' ? '#6B7280' : '#1A1D26' }}>{f.nombre}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: f.estado === 'hecho' ? '#ECFDF5' : f.estado === 'en_curso' ? '#EEF2FF' : '#F0F2F5', color: e.color }}>{e.label}</span>
                </div>
                {f.fecha && <div style={{ fontSize: 13, fontWeight: 600, color: e.color, marginTop: 2 }}>{f.fecha}</div>}
                {f.detalle && <div style={{ fontSize: 13.5, color: '#9CA3AF', marginTop: 4, lineHeight: 1.45 }}>{f.detalle}</div>}
              </div>
            </div>
          );
        })}
        {fases.length === 0 && (
          <Card style={{ padding: 22, textAlign: 'center', color: '#6B7280' }}>
            Todavía no cargamos las etapas de tu proyecto. En cuanto estén, las vas a ver acá con sus fechas.
          </Card>
        )}
      </div>

      {/* Historial: lo último que pasó en tu proyecto (subidas, devoluciones,
          guiones publicados, tareas completadas). */}
      {movimientos.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>Últimos movimientos</h2>
          <Card style={{ padding: '4px 16px' }}>
            {movimientos.map((m, i) => {
              const mi = MOV_ICON[m.tipo] || MOV_ICON.subida;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderTop: i === 0 ? 'none' : '1px solid #F0F2F5' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: mi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <mi.Icon size={16} color={mi.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#1A1D26', lineHeight: 1.35 }}>{m.texto}</div>
                  <div style={{ fontSize: 11.5, color: '#9CA3AF', flexShrink: 0 }}>{m.fecha}</div>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </Screen>
      )}
    </PhoneFrame>
  );
}

import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Upload, Undo2, FileText, ClipboardCheck, Trophy } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { Screen, Card, Progress, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';

// Ícono por tipo de movimiento del historial automático.
const MOV_ICON = {
  subida:     { Icon: Upload, color: '#2E69E0', bg: '#EEF2FF' },
  devolucion: { Icon: Undo2, color: '#059669', bg: '#ECFDF5' },
  guion:      { Icon: FileText, color: '#8B5CF6', bg: '#F5F3FF' },
  tarea:      { Icon: ClipboardCheck, color: '#B45309', bg: '#FEF3C7' },
};

// Avance del proyecto:
//   · Progreso general = el avance REAL de los funnels (guion→grabación→edición→
//     publicado). Todos publicados = 100% → "Funnels todos terminados".
//   · Historial = la línea de tiempo que el equipo lleva en operaciones.
export default function PipelineScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.pipeline(), []);
  const { data: movs } = useAsync(() => api.movimientos(), []);
  const progreso = data?.progreso ?? 0;
  const terminado = data?.todosTerminados === true;
  const eventos = Array.isArray(data?.eventos) ? data.eventos : [];
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
          <p style={{ margin: '0 0 18px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Así viene tu proyecto y todo lo que fuimos haciendo.</p>

          {terminado ? (
            <Card style={{ padding: 20, marginBottom: 8, background: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trophy size={24} color="#FFFFFF" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#065F46', lineHeight: 1.25 }}>Funnels todos terminados</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#059669', marginTop: 2 }}>Ahora, optimizando los resultados</div>
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#059669', flexShrink: 0 }}>100%</span>
            </Card>
          ) : (
            <Card style={{ padding: 18, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1D26' }}>Progreso general</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#5B7CF5', letterSpacing: '-0.02em' }}>{progreso}%</span>
              </div>
              <Progress value={progreso} color="#5B7CF5" height={12} />
              <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 10 }}>Calculado con el avance real de tus funnels (guion → grabación → edición → publicado).</div>
            </Card>
          )}

          {/* ── HISTORIAL DEL PROYECTO: la línea de tiempo que lleva el equipo. ── */}
          {eventos.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>Historial de tu proyecto</h2>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, color: '#6B7280' }}>Todo lo que fuimos haciendo, día a día.</p>
              <div style={{ position: 'relative', paddingLeft: 4 }}>
                {eventos.map((e, i) => {
                  const last = i === eventos.length - 1;
                  const bloqueo = e.tipo === 'bloqueo';
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 999, marginTop: 5, background: bloqueo ? '#F59E0B' : '#22C55E', border: `2px solid ${bloqueo ? '#FDE68A' : '#BBF7D0'}` }} />
                        {!last && <div style={{ width: 2, flex: 1, minHeight: 18, background: '#E2E5EB', margin: '2px 0' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 16 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9CA3AF' }}>{e.fecha}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1D26', lineHeight: 1.4, marginTop: 2 }}>{e.titulo}</div>
                        {e.descripcion && <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 3, lineHeight: 1.45 }}>{e.descripcion}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Historial automático de la plataforma (subidas, devoluciones, guiones, tareas). */}
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

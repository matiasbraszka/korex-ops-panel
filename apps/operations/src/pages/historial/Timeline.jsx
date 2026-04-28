import { useState, Fragment } from 'react';
import { T } from './tokens.js';
import { useViewport } from './useViewport.js';
import { useHistorialConfig } from './useHistorialConfig.js';
import { EventCard, EventTypePill } from './EventCard.jsx';

function KPICard({ label, value, sub, accent, alert = false, trend }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${alert ? T.red : T.border}`,
      borderRadius: 12, padding: '14px 16px', minWidth: 0,
      boxShadow: '0 1px 2px rgba(10,22,40,.04)',
      borderLeft: alert ? `4px solid ${T.red}` : (accent ? `4px solid ${accent}` : `1px solid ${T.border}`),
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.text3, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: alert ? T.red : T.text, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
        {trend && (
          <div style={{ fontSize: 11, color: trend.startsWith('+') ? T.green : T.red, fontWeight: 600 }}>{trend}</div>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function KPIStrip({ eventos, faseActual, diasProyecto }) {
  const vp = useViewport();
  const { fases, fasesByN, total } = useHistorialConfig();
  const cols = vp.mobile ? 2 : (vp.tablet ? 3 : 5);
  const totalEventos = eventos.length;
  const entregables = eventos.filter(e => e.tipo === 'entregable').length;
  const tiempoTotal = eventos.reduce((s, e) => s + (e.tiempo || 0), 0);
  const horas = Math.round(tiempoTotal / 60 * 10) / 10;
  const bloqueos = eventos.filter(e => e.tipo === 'bloqueo' && e.estado === 'en-curso');
  const diasBloqueado = bloqueos.reduce((m, e) => Math.max(m, e.bloqueo?.diasBloqueo || 0), 0);
  const fase = fasesByN[faseActual] || fases[0] || { label: '—' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: vp.mobile ? 8 : 12, marginBottom: 18 }}>
      <KPICard label="Días activos" value={diasProyecto || 0} sub="desde firma" />
      <KPICard label="Eventos" value={totalEventos} sub={`${entregables} entregables`} />
      <KPICard label="Tiempo Korex" value={`${horas}h`} sub="acumulado" accent={T.blue} />
      <KPICard label="Bloqueos" value={bloqueos.length} sub={diasBloqueado ? `${diasBloqueado} días` : 'sin bloqueos'} alert={bloqueos.length > 0} />
      <KPICard label="Fase actual" value={`${faseActual}/${total}`} sub={fase.label} accent={T.blue} />
    </div>
  );
}

function FaseStepper({ faseActual = 1 }) {
  const vp = useViewport();
  const { fases, fasesByN, total } = useHistorialConfig();
  const compact = vp.w < 1100;
  const fase = fasesByN[faseActual] || fases[0] || { label: '—' };
  return (
    <div style={{
      background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
      padding: vp.mobile ? '14px 16px' : '18px 22px', marginBottom: 18,
      boxShadow: '0 1px 2px rgba(10,22,40,.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Fases del Método Korex</div>
        <div style={{ fontSize: 11, color: T.text3 }}>
          Fase {faseActual}/{total} · <span style={{ color: T.blue, fontWeight: 700 }}>{fase.label}</span>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        overflowX: compact ? 'auto' : 'visible',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: compact ? 4 : 0,
        scrollbarWidth: 'thin',
      }}>
        {fases.map((f, i) => {
          const done = f.n < faseActual;
          const current = f.n === faseActual;
          return (
            <Fragment key={f.n}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', minWidth: compact ? 56 : 'auto' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: current ? `2px solid ${T.blue}` : (done ? `1.5px solid ${T.blue}` : `1.5px solid ${T.border}`),
                  background: done ? T.blue : '#fff',
                  color: done ? '#fff' : (current ? T.blue : T.text3),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                  boxShadow: current ? `0 0 0 4px ${T.blueBg}` : 'none',
                  transition: 'all 0.15s',
                }}>{done ? '✓' : f.n}</div>
                <div style={{
                  fontSize: 10, color: current ? T.blue : T.text3, marginTop: 6,
                  fontWeight: current ? 700 : 500, textAlign: 'center', whiteSpace: 'nowrap',
                  letterSpacing: current ? '0.02em' : '0',
                }}>{f.short}</div>
              </div>
              {i < fases.length - 1 && (
                <div style={{
                  flex: compact ? '0 0 16px' : 1, height: 2,
                  background: f.n < faseActual ? T.blue : T.border,
                  marginBottom: 18, minWidth: 8, borderRadius: 1,
                }} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function BlockerBanner({ eventos }) {
  const vp = useViewport();
  const bloqueo = eventos.find(e => e.tipo === 'bloqueo' && e.estado === 'en-curso');
  if (!bloqueo) return null;
  const dias = bloqueo.bloqueo?.diasBloqueo || 0;
  const esperando = bloqueo.bloqueo?.esperando || '—';
  return (
    <div style={{
      background: T.redBg, border: `1px solid ${T.red}30`,
      borderLeft: `4px solid ${T.red}`,
      borderRadius: 10, padding: vp.mobile ? '12px 14px' : '12px 16px',
      display: 'flex', alignItems: vp.mobile ? 'flex-start' : 'center',
      gap: vp.mobile ? 10 : 14, marginBottom: 18, flexWrap: 'wrap',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: '#fff', border: `1px solid ${T.red}30`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.red, lineHeight: 1 }}>{dias}</div>
        <div style={{ fontSize: 9, color: T.red, fontWeight: 600, letterSpacing: '0.05em' }}>DÍAS</div>
      </div>
      <div style={{ flex: 1, minWidth: vp.mobile ? '60%' : 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.red, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          ⚠ Bloqueo activo · esperando a {esperando}
        </div>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{bloqueo.titulo}</div>
      </div>
    </div>
  );
}

export function Timeline({ eventos, faseActual, diasProyecto, onGenerarResumen, onNuevoEvento, onDeleteEvento }) {
  const vp = useViewport();
  const [filtro, setFiltro] = useState('todos');
  const lista = filtro === 'todos' ? eventos : eventos.filter(e => e.tipo === filtro);
  const tiempoVisible = lista.reduce((s, e) => s + (e.tiempo || 0), 0);
  const horas = Math.round(tiempoVisible / 60 * 10) / 10;

  const filtros = [
    { id: 'todos', label: 'Todos', count: eventos.length },
    { id: 'entregable', label: vp.mobile ? 'Entreg.' : 'Entregables', count: eventos.filter(e => e.tipo === 'entregable').length },
    { id: 'bloqueo', label: 'Bloqueos', count: eventos.filter(e => e.tipo === 'bloqueo').length },
    { id: 'decision', label: vp.mobile ? 'Decis.' : 'Decisiones', count: eventos.filter(e => e.tipo === 'decision').length },
    { id: 'metrica', label: vp.mobile ? 'Métric.' : 'Métricas', count: eventos.filter(e => e.tipo === 'metrica').length },
  ];

  return (
    <div style={{ paddingBottom: vp.mobile ? 110 : 120 }}>
      <KPIStrip eventos={eventos} faseActual={faseActual} diasProyecto={diasProyecto} />
      <FaseStepper faseActual={faseActual} />
      <BlockerBanner eventos={eventos} />

      <div style={{
        display: 'flex',
        flexDirection: vp.mobile ? 'column' : 'row',
        alignItems: vp.mobile ? 'stretch' : 'center',
        gap: vp.mobile ? 10 : 8, marginBottom: 16,
      }}>
        <div style={{
          display: 'flex', gap: 6,
          overflowX: vp.mobile ? 'auto' : 'visible',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: vp.mobile ? 4 : 0,
          scrollbarWidth: 'none',
        }}>
          {filtros.map(f => {
            const active = filtro === f.id;
            return (
              <button key={f.id} onClick={() => setFiltro(f.id)} style={{
                background: active ? T.text : '#fff',
                color: active ? '#fff' : T.text2,
                border: `1px solid ${active ? T.text : T.border}`,
                borderRadius: 999, padding: '7px 12px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'all 0.12s', whiteSpace: 'nowrap', flexShrink: 0, minHeight: 36,
              }}>
                {f.label}
                <span style={{
                  background: active ? 'rgba(255,255,255,0.2)' : T.surface2,
                  color: active ? '#fff' : T.text3,
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 999, minWidth: 18, textAlign: 'center',
                }}>{f.count}</span>
              </button>
            );
          })}
        </div>
        {!vp.mobile && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onGenerarResumen} style={{
              background: '#fff', border: `1px solid ${T.blue}`, color: T.blue,
              borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36,
            }}>✉ Generar resumen semanal</button>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', paddingLeft: vp.mobile ? 28 : 36 }}>
        <div style={{
          position: 'absolute', left: vp.mobile ? 9 : 13, top: 8, bottom: 8,
          width: 2, background: T.border, borderRadius: 1,
        }} />
        {lista.length === 0 && (
          <div style={{
            background: '#fff', border: `1px dashed ${T.border}`,
            borderRadius: 10, padding: '40px 16px', textAlign: 'center',
            color: T.text3, fontSize: 13,
          }}>
            Sin eventos para este filtro.<br/>
            <span style={{ fontSize: 11 }}>Cargá uno con el botón "+ Nuevo evento".</span>
          </div>
        )}
        {lista.map((ev, idx) => {
          const prevDate = idx > 0 ? lista[idx-1].fecha : null;
          const showDateHeader = ev.fecha !== prevDate;
          const dotSize = 10;
          const lineCenter = vp.mobile ? 10 : 14;
          const paddingL = vp.mobile ? 28 : 36;
          const dotLeft = lineCenter - dotSize / 2 - paddingL;
          return (
            <Fragment key={ev.id}>
              {showDateHeader && (
                <div style={{
                  position: 'relative', margin: idx === 0 ? '0 0 10px' : '22px 0 10px',
                  minHeight: 18, display: 'flex', alignItems: 'center',
                }}>
                  <div style={{
                    position: 'absolute', left: dotLeft, top: '50%',
                    transform: 'translateY(-50%)',
                    width: dotSize, height: dotSize, borderRadius: '50%',
                    background: '#fff', border: `2px solid ${T.border}`,
                    boxShadow: '0 0 0 3px #F7F8FA', zIndex: 2,
                  }} />
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: T.text3,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>{ev.fecha}</div>
                </div>
              )}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <EventCard event={ev} onDelete={onDeleteEvento} />
              </div>
            </Fragment>
          );
        })}
      </div>

      <div style={{
        marginTop: 22, padding: vp.mobile ? '14px 16px' : '14px 18px',
        background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10,
        display: 'flex',
        flexDirection: vp.mobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: vp.mobile ? 'stretch' : 'center',
        gap: vp.mobile ? 12 : 0,
        boxShadow: '0 1px 2px rgba(10,22,40,.04)',
      }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 10, color: T.text3, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total visible</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{lista.length} eventos</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.text3, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tiempo Korex</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.blue }}>{horas}h <span style={{ fontSize: 12, color: T.text3, fontWeight: 500 }}>· {tiempoVisible} min</span></div>
          </div>
        </div>
        <button onClick={onGenerarResumen} style={{
          background: T.blue, border: 'none', color: '#fff',
          borderRadius: 8, padding: '11px 18px', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          width: vp.mobile ? '100%' : 'auto', minHeight: 44,
        }}>{vp.mobile ? '✉ Resumen semanal →' : 'Generar resumen semanal →'}</button>
      </div>
    </div>
  );
}

export function FabAdd({ onClick }) {
  const vp = useViewport();
  return (
    <button onClick={onClick} style={{
      position: 'fixed',
      right: vp.mobile ? 16 : 28,
      bottom: vp.mobile ? 16 : 28,
      background: T.blue, color: '#fff', border: 'none',
      borderRadius: 999,
      padding: vp.mobile ? '12px 16px' : '14px 20px',
      fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
      cursor: 'pointer',
      boxShadow: '0 8px 24px rgba(91,124,245,0.4), 0 2px 6px rgba(91,124,245,0.2)',
      display: 'flex', alignItems: 'center', gap: 7,
      zIndex: 20, transition: 'transform 0.12s', minHeight: 44,
    }}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'}
    onMouseLeave={e => e.currentTarget.style.transform = ''}
    >
      <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 400 }}>+</span>
      {vp.mobile ? 'Evento' : 'Nuevo evento'}
    </button>
  );
}

export { EventTypePill };

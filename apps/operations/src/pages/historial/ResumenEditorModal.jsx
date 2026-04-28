import { useEffect, useMemo, useState } from 'react';
import { T, EVENT_TYPES } from './tokens.js';
import { useViewport } from './useViewport.js';
import { EventTypePill } from './EventCard.jsx';

const isoDaysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const isoToday = () => new Date().toISOString().slice(0, 10);

const miniBtn = {
  background: '#fff', border: `1px solid ${T.border}`,
  color: T.text2, borderRadius: 6, padding: '5px 10px',
  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 28,
};
const footerBtnGhost = {
  background: '#fff', border: `1px solid ${T.border}`,
  color: T.text2, borderRadius: 10, padding: '10px 18px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
};

function StepLabel({ n, label, inline }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: inline ? 0 : 10 }}>
      <span style={{
        width: 22, height: 22, borderRadius: 999, background: T.text, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
      }}>{n}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}
function FieldLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>{children}</div>;
}
function DateInput({ value, onChange }) {
  return <input type="date" value={value} onChange={e => onChange(e.target.value)} style={{
    width: '100%', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 8,
    padding: '10px 11px', fontSize: 13, fontFamily: 'inherit', color: T.text, outline: 'none', minHeight: 40,
  }} />;
}
function PlainInput({ value, onChange }) {
  return <input value={value} onChange={e => onChange(e.target.value)} style={{
    width: '100%', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 8,
    padding: '10px 11px', fontSize: 13, fontFamily: 'inherit', color: T.text, outline: 'none', minHeight: 40,
  }} />;
}

export function ResumenEditorModal({ open, onClose, eventos, cliente }) {
  const vp = useViewport();
  const [tab, setTab] = useState('rango');

  const [desde, setDesde] = useState(isoDaysAgo(7));
  const [hasta, setHasta] = useState(isoToday());
  const [asunto, setAsunto] = useState(`Avance semanal · ${cliente?.company || cliente?.name || 'Proyecto'}`);
  const [destinatario, setDestinatario] = useState(cliente?.email || '');
  const [enviado, setEnviado] = useState(false);
  const [incluidos, setIncluidos] = useState({});
  const [cuerpo, setCuerpo] = useState('');
  const [cuerpoTocado, setCuerpoTocado] = useState(false);

  const eventosRango = useMemo(
    () => (eventos || []).filter(e => e.fecha >= desde && e.fecha <= hasta),
    [eventos, desde, hasta]
  );

  useEffect(() => {
    setIncluidos(prev => {
      const next = {};
      eventosRango.forEach(e => { next[e.id] = prev[e.id] ?? (e.incluirResumen !== false); });
      return next;
    });
  }, [eventosRango]);

  const incluidosLista = eventosRango.filter(e => incluidos[e.id]);
  const entregables = incluidosLista.filter(e => e.tipo === 'entregable' || e.tipo === 'hito');
  const decisiones  = incluidosLista.filter(e => e.tipo === 'decision' || e.tipo === 'validacion');
  const bloqueos    = incluidosLista.filter(e => e.tipo === 'bloqueo');
  const metricas    = incluidosLista.filter(e => e.tipo === 'metrica');

  const generarCuerpo = () => {
    const nombre = (cliente?.name || '').split(' ')[0] || 'cliente';
    let txt = `Hola ${nombre},\n\n`;
    txt += `Te resumo el avance del proyecto entre el ${desde} y el ${hasta}.\n\n`;
    if (entregables.length) {
      txt += `LO QUE COMPLETAMOS:\n`;
      entregables.forEach(e => { txt += `  ✓ ${e.titulo}\n`; });
      txt += `\n`;
    }
    if (decisiones.length) {
      txt += `DECISIONES Y APROBACIONES:\n`;
      decisiones.forEach(e => { txt += `  ▶ ${e.titulo}\n`; });
      txt += `\n`;
    }
    if (bloqueos.length) {
      txt += `NECESITAMOS DE TI:\n`;
      bloqueos.forEach(e => {
        txt += `  ⚠ ${e.titulo}`;
        if (e.bloqueo?.diasBloqueo) txt += ` (${e.bloqueo.diasBloqueo} días esperando)`;
        txt += `\n`;
      });
      txt += `\n`;
    }
    if (metricas.length) {
      txt += `MÉTRICAS DEL PERÍODO:\n`;
      metricas.forEach(e => { txt += `  ▲ ${e.titulo}\n`; });
      txt += `\n`;
    }
    txt += `Cualquier duda, respondeme este mismo email.\n\n— Equipo Korex`;
    return txt;
  };

  useEffect(() => {
    if (!cuerpoTocado) setCuerpo(generarCuerpo());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, JSON.stringify(incluidos), cliente?.name]);

  if (!open) return null;

  const ColRango = (
    <div style={{
      borderRight: vp.desktop ? `1px solid ${T.border}` : 'none',
      padding: vp.mobile ? '16px' : '20px 22px',
      overflowY: 'auto', background: vp.desktop ? T.bg : '#fff', height: '100%',
    }}>
      <StepLabel n="1" label="Rango de fechas" />
      <div style={{
        background: '#fff', border: `1px solid ${T.border}`,
        borderRadius: 10, padding: 14, marginBottom: 14,
        boxShadow: '0 1px 2px rgba(10,22,40,.04)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: vp.mobile ? '1fr 1fr' : '1fr', gap: 10 }}>
          <div>
            <FieldLabel>Desde</FieldLabel>
            <DateInput value={desde} onChange={setDesde} />
          </div>
          <div>
            <FieldLabel>Hasta</FieldLabel>
            <DateInput value={hasta} onChange={setHasta} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
        {[
          ['Esta semana', isoDaysAgo(6), isoToday()],
          ['Última', isoDaysAgo(13), isoDaysAgo(7)],
          ['Últimas 2', isoDaysAgo(13), isoToday()],
          ['Mes', isoDaysAgo(30), isoToday()],
          ['Todo', '2024-01-01', isoToday()],
        ].map(([label, d, h]) => (
          <button key={label} onClick={() => { setDesde(d); setHasta(h); }} style={{
            background: '#fff', border: `1px solid ${T.border}`,
            borderRadius: 999, padding: '6px 12px',
            fontSize: 11, fontWeight: 600, color: T.text2,
            cursor: 'pointer', fontFamily: 'inherit', minHeight: 32,
          }}>{label}</button>
        ))}
      </div>

      <StepLabel n="2" label="Destinatario" />
      <div style={{
        background: '#fff', border: `1px solid ${T.border}`,
        borderRadius: 10, padding: 14, marginBottom: 22,
        boxShadow: '0 1px 2px rgba(10,22,40,.04)',
      }}>
        <FieldLabel>Email</FieldLabel>
        <PlainInput value={destinatario} onChange={setDestinatario} />
        <div style={{ height: 10 }} />
        <FieldLabel>Asunto</FieldLabel>
        <PlainInput value={asunto} onChange={setAsunto} />
      </div>

      <div style={{
        background: '#fff', border: `1px solid ${T.blue}30`,
        borderLeft: `4px solid ${T.blue}`,
        borderRadius: 10, padding: '14px 16px',
        boxShadow: '0 1px 2px rgba(10,22,40,.04)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.blue, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          Resumen del rango
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {eventosRango.length} <span style={{ fontSize: 14, fontWeight: 500, color: T.text3 }}>eventos</span>
        </div>
        <div style={{ fontSize: 12, color: T.text2, marginTop: 6, lineHeight: 1.6 }}>
          <div><b>{incluidosLista.length}</b> incluidos en el email</div>
          <div>{bloqueos.length} bloqueo{bloqueos.length !== 1 ? 's' : ''} · {entregables.length} entregables</div>
          <div>{incluidosLista.reduce((s, e) => s + (e.tiempo || 0), 0)} min de equipo Korex</div>
        </div>
      </div>
    </div>
  );

  const ColEventos = (
    <div style={{
      borderRight: vp.desktop ? `1px solid ${T.border}` : 'none',
      padding: vp.mobile ? '16px' : '20px 22px',
      overflowY: 'auto', height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <StepLabel n="3" label="Eventos a incluir" inline />
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => {
            const all = {}; eventosRango.forEach(e => all[e.id] = true);
            setIncluidos(all); setCuerpoTocado(false);
          }} style={miniBtn}>Todos</button>
          <button onClick={() => {
            const none = {}; eventosRango.forEach(e => none[e.id] = false);
            setIncluidos(none); setCuerpoTocado(false);
          }} style={miniBtn}>Ninguno</button>
        </div>
      </div>

      {eventosRango.length === 0 && (
        <div style={{
          background: T.bg, border: `1px solid ${T.border}`,
          borderRadius: 10, padding: 28, textAlign: 'center',
          color: T.text3, fontSize: 13,
        }}>
          No hay eventos en este rango.<br/>
          <span style={{ fontSize: 11 }}>Probá ampliar las fechas.</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {eventosRango.map(ev => {
          const t = EVENT_TYPES[ev.tipo] || EVENT_TYPES.entregable;
          const inc = incluidos[ev.id] ?? true;
          return (
            <label key={ev.id} style={{
              background: '#fff',
              border: `1px solid ${inc ? t.color + '60' : T.border}`,
              borderLeft: `4px solid ${inc ? t.color : T.borderLight}`,
              borderRadius: 10, padding: '12px 14px',
              cursor: 'pointer', display: 'flex', gap: 12,
              opacity: inc ? 1 : 0.55, transition: 'all 0.12s',
              boxShadow: inc ? '0 1px 2px rgba(10,22,40,.04)' : 'none',
            }}>
              <input type="checkbox" checked={inc}
                onChange={e => { setIncluidos({ ...incluidos, [ev.id]: e.target.checked }); setCuerpoTocado(false); }}
                style={{ accentColor: t.color, width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                  <EventTypePill tipo={ev.tipo} />
                  <span style={{ fontSize: 10, color: T.text3 }}>{ev.fecha}{ev.hora ? ` · ${ev.hora}` : ''}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 3, letterSpacing: '-0.005em' }}>{ev.titulo}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>
                  Fase {ev.fase} · {ev.tiempo || 0}min · {ev.autor || '—'}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );

  const ColEmail = (
    <div style={{
      padding: vp.mobile ? '16px' : '20px 22px', overflowY: 'auto',
      background: vp.desktop ? T.bg : '#fff',
      display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <StepLabel n="4" label="Email" inline />
        <button onClick={() => { setCuerpo(generarCuerpo()); setCuerpoTocado(false); }} style={miniBtn}>↺ Regenerar</button>
      </div>

      <div style={{
        background: '#fff', border: `1px solid ${T.border}`,
        borderRadius: 10, padding: '14px 16px', marginBottom: 10,
        fontSize: 12, boxShadow: '0 1px 2px rgba(10,22,40,.04)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', rowGap: 7 }}>
          <div style={{ color: T.text3, fontWeight: 600 }}>Para:</div>
          <div style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{destinatario || <span style={{ color: T.text3 }}>(falta email)</span>}</div>
          <div style={{ color: T.text3, fontWeight: 600 }}>De:</div>
          <div style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>soporte@metodokorex.com</div>
          <div style={{ color: T.text3, fontWeight: 600 }}>Asunto:</div>
          <div style={{ color: T.text, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{asunto}</div>
        </div>
      </div>

      <textarea
        value={cuerpo}
        onChange={e => { setCuerpo(e.target.value); setCuerpoTocado(true); }}
        style={{
          flex: 1, background: '#fff', border: `1px solid ${T.border}`,
          borderRadius: 10, padding: '16px 18px',
          fontSize: 13, fontFamily: 'Inter, sans-serif', color: T.text,
          outline: 'none', resize: 'none',
          lineHeight: 1.6, minHeight: 280,
          boxShadow: '0 1px 2px rgba(10,22,40,.04)',
          transition: 'border 0.12s',
        }}
        onFocus={e => e.target.style.borderColor = T.blue}
        onBlur={e => e.target.style.borderColor = T.border}
      />

      <div style={{ marginTop: 10, fontSize: 11, color: cuerpoTocado ? T.orange : T.text3, fontStyle: 'italic' }}>
        {cuerpoTocado
          ? '✎ Editaste manualmente — no se regenerará al cambiar eventos.'
          : 'Auto-generado · se actualiza si cambiás eventos del rango.'}
      </div>
    </div>
  );

  let body;
  if (vp.desktop) {
    body = (
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '320px 1fr 1fr', minHeight: 0,
      }}>
        {ColRango}{ColEventos}{ColEmail}
      </div>
    );
  } else if (vp.tablet) {
    body = (
      <div style={{
        flex: 1, overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}`, minHeight: 0 }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: '#fff' }}>
            {[['rango', 'Rango & Destinatario'], ['eventos', `Eventos (${eventosRango.length})`]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                flex: 1, background: 'none', border: 'none', padding: '12px 8px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                color: tab === k ? T.blue : T.text2,
                borderBottom: tab === k ? `2px solid ${T.blue}` : '2px solid transparent',
                marginBottom: -1, minHeight: 44,
              }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {tab === 'eventos' ? ColEventos : ColRango}
          </div>
        </div>
        {ColEmail}
      </div>
    );
  } else {
    body = (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: '#fff', overflowX: 'auto' }}>
          {[['rango', 'Rango'], ['eventos', `Eventos (${eventosRango.length})`], ['email', 'Email']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, background: 'none', border: 'none', padding: '12px 8px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              color: tab === k ? T.blue : T.text2,
              borderBottom: tab === k ? `2px solid ${T.blue}` : '2px solid transparent',
              marginBottom: -1, whiteSpace: 'nowrap', minHeight: 44,
            }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {tab === 'rango' && ColRango}
          {tab === 'eventos' && ColEventos}
          {tab === 'email' && ColEmail}
        </div>
      </div>
    );
  }

  const handleEnviar = () => {
    // TODO backend: llamar endpoint de envío de email (ej. Edge Function Supabase + Resend).
    // Por ahora, muestra el feedback visual y cierra.
    setEnviado(true);
    setTimeout(() => { setEnviado(false); onClose && onClose(); }, 1400);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15, 18, 28, 0.5)',
      display: 'flex', padding: vp.mobile ? 0 : (vp.tablet ? 12 : 24),
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        flex: 1, background: '#fff',
        borderRadius: vp.mobile ? 0 : 16,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 40px 80px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          padding: vp.mobile ? '12px 16px' : '16px 24px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, gap: 12,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.text3, textTransform: 'uppercase' }}>
              Resumen semanal
            </div>
            <div style={{
              fontSize: vp.mobile ? 16 : 20, fontWeight: 700, color: T.text,
              lineHeight: 1.2, marginTop: 2, letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {vp.mobile
                ? `Resumen · ${(cliente?.name || '').split(' ')[0] || ''}`
                : `Resumen para ${cliente?.name || 'cliente'}`}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: T.surface2, border: 'none', cursor: 'pointer',
            color: T.text2, fontSize: 16, padding: 0,
            width: 36, height: 36, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }} aria-label="Cerrar">✕</button>
        </div>

        {body}

        <div style={{
          padding: vp.mobile ? '12px 16px' : '14px 24px', borderTop: `1px solid ${T.border}`,
          display: 'flex',
          flexDirection: vp.mobile ? 'column' : 'row',
          alignItems: vp.mobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
          flexShrink: 0, gap: 10, background: '#fff',
        }}>
          <div style={{ fontSize: 12, color: T.text3, textAlign: vp.mobile ? 'center' : 'left' }}>
            <b style={{ color: T.text2 }}>{incluidosLista.length}</b> evento{incluidosLista.length !== 1 ? 's' : ''} en el email · {desde} → {hasta}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!vp.mobile && <button onClick={onClose} style={footerBtnGhost}>Cancelar</button>}
            <button style={{
              flex: vp.mobile ? 1 : 'none',
              background: '#fff', border: `1px solid ${T.blue}`, color: T.blue,
              borderRadius: 10, padding: vp.mobile ? '12px 14px' : '10px 18px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
            }}>{vp.mobile ? 'Borrador' : 'Guardar borrador'}</button>
            <button onClick={handleEnviar} style={{
              flex: vp.mobile ? 2 : 'none',
              background: enviado ? T.green : T.blue,
              border: 'none', color: '#fff', borderRadius: 10,
              padding: vp.mobile ? '12px 16px' : '10px 22px',
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: enviado ? `0 2px 6px ${T.green}50` : `0 2px 6px ${T.blue}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 44,
            }}>{enviado ? '✓ Enviado' : (vp.mobile ? 'Enviar →' : 'Enviar email →')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

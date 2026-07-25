// Repaso final.
//
// Acá vuelven las respuestas que el cliente pasó de largo con "igual quiero
// seguir". No es un castigo: en la segunda pasada ya agarró ritmo y con el
// micrófono a mano recupera la mayoría. Por eso el bloque se llama "podemos
// mejorar" y no "te faltan".
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IcoCheck, IcoWarn, IcoUpload, IcoChevR } from '../../components/icons';
import { Spinner } from '../../components/ui';
import { TO, F, dsp, btn, label, chip } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { onb } from '../api';

export default function RepasoScreen() {
  const navigate = useNavigate();
  const { secciones, respuestas, bloqueantes, progreso, cortas, flush, setEstado } = useOnboarding();
  const [cerrando, setCerrando] = useState(false);
  const [faltan, setFaltan] = useState(null);
  const [error, setError] = useState('');

  const bloqPend = (bloqueantes || []).filter(
    (b) => Number(b.subidos || 0) < Math.max(Number(b.target || 1), 1),
  );

  const terminar = async () => {
    setCerrando(true); setError(''); setFaltan(null);
    await flush();
    try {
      const r = await onb.completar();
      if (r?.ok) {
        setEstado((e) => (e ? { ...e, estado: 'completado' } : e));
        navigate('/onboarding/listo', { replace: true });
        return;
      }
      if (r?.error === 'faltan') { setFaltan(r.faltan || []); return; }
      setError('No pudimos cerrar tu onboarding. Probá de nuevo en un momento.');
    } catch {
      setError('No pudimos cerrar tu onboarding. Revisá tu conexión y probá de nuevo.');
    } finally {
      setCerrando(false);
    }
  };

  const irA = (qkey) => {
    const s = secciones.find((x) => (x.preguntas || []).some((q) => q.qkey === qkey));
    if (s) navigate(`/onboarding/${s.skey}/${qkey}`);
  };

  const listo = progreso.pct >= 100;

  // El título tiene que corresponderse con el número que muestra la barra: decir
  // "casi terminás" con un 5% hace que el cliente deje de creerle a la pantalla.
  const titulo = listo ? 'Está todo listo'
    : progreso.pct >= 80 ? 'Casi terminás'
    : progreso.pct >= 40 ? 'Vas por la mitad'
    : 'Esto es lo que falta';
  const bajada = listo ? 'Repasá si querés mejorar alguna respuesta y cerramos.'
    : progreso.pct >= 80 ? 'Te falta poco. Esto es lo que necesitamos para arrancar.'
    : 'Podés seguir cuando quieras, no se pierde nada. Acá tenés todo lo que queda pendiente.';

  return (
    <OnbShell>
      <OnbHeader titulo="Repaso final" onVolver={() => navigate('/onboarding')} />

      <div className="kxs" style={{ flex: 1, paddingTop: 26, paddingBottom: 30 }}>
        <div style={{ ...dsp(F.h1, '-0.033em'), lineHeight: 1.14 }}>{titulo}</div>
        <div style={{ fontSize: F.body, lineHeight: 1.55, color: TO.body, marginTop: 12 }}>
          {bajada}
        </div>

        {/* Material bloqueante */}
        {bloqPend.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ ...label(TO.amber), marginBottom: 11 }}>
              Sin esto no podemos empezar
            </div>
            <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TO.line}`, padding: 4 }}>
              {bloqPend.map((b, i) => (
                <Fila
                  key={b.tipo} borde={i > 0}
                  icono={<IcoUpload size={19} stroke={TO.amber} />}
                  titulo={b.titulo}
                  detalle={b.target ? `${b.subidos || 0} de ${b.target}` : 'Falta'}
                  color={TO.amber} fondo={TO.amberWash}
                  onClick={() => {
                    const s = secciones.find((x) => (x.preguntas || []).some((q) => q.bucket === b.bucket));
                    const q = s?.preguntas?.find((x) => x.bucket === b.bucket);
                    if (s && q) navigate(`/onboarding/${s.skey}/${q.qkey}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Respuestas cortas */}
        {cortas.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ ...label(), marginBottom: 6 }}>
              {cortas.length} {cortas.length === 1 ? 'respuesta que podemos mejorar' : 'respuestas que podemos mejorar'}
            </div>
            <div style={{ fontSize: F.meta, color: TO.body, marginBottom: 12, lineHeight: 1.55 }}>
              Con un poco más de detalle, lo que escribamos te va a salir mucho mejor.
              Tocá una y contala hablando: son menos de dos minutos.
            </div>
            <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TO.line}`, padding: 4 }}>
              {cortas.map((q, i) => {
                const len = String(respuestas[q.qkey]?.valor || '').trim().length;
                return (
                  <Fila
                    key={q.qkey} borde={i > 0}
                    icono={<span style={{ fontSize: 14, fontWeight: 800, color: TO.meta }}>{i + 1}</span>}
                    titulo={q.label}
                    detalle={`${Math.round((len / q.minChars) * 100)}%`}
                    onClick={() => irA(q.qkey)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Lo que sí está */}
        <div style={{
          marginTop: 28, padding: '18px 18px', borderRadius: 18,
          background: TO.greenWash, border: '1px solid #A7DFBE',
          display: 'flex', gap: 13, alignItems: 'flex-start',
        }}>
          <IcoCheck size={21} stroke={TO.greenInk} sw={2.6} style={{ flex: 'none', marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: TO.greenInk, letterSpacing: '-0.01em' }}>
              {progreso.respondidas} de {progreso.requeridas} respuestas completas
            </div>
            <div style={{ fontSize: F.meta, color: TO.greenInk, marginTop: 4, lineHeight: 1.5 }}>
              Todo guardado. No se pierde nada aunque cierres.
            </div>
          </div>
        </div>

        {faltan && faltan.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ ...label(TO.redInk), marginBottom: 11 }}>Todavía falta esto</div>
            <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TO.line}`, padding: 4 }}>
              {faltan.map((f, i) => (
                <Fila
                  key={f.qkey} borde={i > 0}
                  icono={<IcoWarn size={19} stroke={TO.redInk} />}
                  titulo={f.label} detalle={f.seccion} color={TO.redInk} fondo={TO.redWash}
                  onClick={() => irA(f.qkey)}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 20, padding: '14px 16px', borderRadius: 14, background: TO.redWash,
            border: '1px solid #E8A0A0', fontSize: F.meta, lineHeight: 1.55,
            color: TO.redInk, fontWeight: 600,
          }}>{error}</div>
        )}
      </div>

      <OnbFooter>
        <button
          type="button" onClick={terminar} disabled={cerrando}
          style={{ ...btn(listo ? TO.greenInk : TO.blueBtn), opacity: cerrando ? 0.6 : 1 }}
        >
          {cerrando ? <Spinner size={19} color="#fff" /> : <IcoCheck size={19} stroke="#fff" sw={2.6} />}
          {cerrando ? 'CERRANDO…' : 'TERMINAR MI ONBOARDING'}
        </button>
        {!listo && (
          <div style={{
            fontSize: F.meta, color: TO.meta, textAlign: 'center', marginTop: 11, lineHeight: 1.45,
          }}>
            Te falta {100 - progreso.pct}% para poder cerrarlo.
          </div>
        )}
      </OnbFooter>
    </OnbShell>
  );
}

function Fila({ icono, titulo, detalle, color, fondo, onClick, borde }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
      padding: '16px 13px', background: 'none', border: 'none', cursor: 'pointer',
      borderTop: borde ? `1px solid ${TO.line}` : 'none', minHeight: 60,
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 10, background: fondo || TO.fill, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icono}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: F.sub, fontWeight: 600, color: TO.ink, lineHeight: 1.4,
      }}>{titulo}</span>
      {detalle && <span style={chip(fondo || TO.fill, color || TO.meta)}>{detalle}</span>}
      <IcoChevR size={18} stroke={TO.meta} style={{ flex: 'none' }} />
    </button>
  );
}

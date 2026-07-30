// ─────────────────────────────────────────────────────────────────────────────
// Una pantalla del onboarding: la portada de un paso, o sus preguntas.
//
// Las dos viven en el mismo componente porque comparten el pie, el contador y
// la navegación: la lista lineal (portada, preguntas, portada, preguntas…) es
// una sola, y partirla en dos rutas obligaba a duplicar toda la lógica de
// "¿qué viene después de esto?".
//
// LO MÁS IMPORTANTE: el botón Continuar NUNCA se bloquea. Cuando falta algo se
// pone azul pálido y aparece una pista debajo, pero se puede tocar. Bloquear a
// alguien porque escribió poco lo humilla y hace que abandone, no que escriba
// más. Lo que falte vuelve a aparecer en el control de calidad del final.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { T, FUENTE, kicker } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import OnbShell, { Pie, usaAncho } from '../components/OnbShell';
import Campo from '../components/Campo';
import { CampoSesion, CampoGrabacion } from '../components/CampoAgenda';
import Resumen from '../components/Resumen';
import { lleno, minLargo, visible, calcularProgreso } from '../progreso';

function Pastilla({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      border: '1px solid rgba(255,255,255,.14)', borderRadius: 999,
      padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: '#D4D7DE',
    }}>{children}</div>
  );
}

export default function PasoScreen() {
  const { paso: skey, pantalla: idPantalla } = useParams();
  const navigate = useNavigate();
  const ancho = usaAncho();
  const {
    pasos, bloques, lista, respuestas, bloqueantes, estado, responder, flush, cargando,
  } = useOnboarding();

  // Dónde estamos dentro de la lista lineal.
  const idx = lista.findIndex((n) => (idPantalla
    ? n.tipo === 'pregunta' && n.paso.skey === skey && n.pantalla.id === idPantalla
    : n.tipo === 'portada' && n.paso.skey === skey));
  const nodo = idx >= 0 ? lista[idx] : null;

  // Una pregunta puede dejar de ser visible porque cambió una respuesta de la
  // que dependía. No hay que dejar al cliente mirando una pantalla fantasma.
  useEffect(() => {
    if (cargando || !lista.length || nodo) return;
    navigate('/onboarding', { replace: true });
  }, [cargando, lista.length, nodo, navigate]);

  if (!nodo) return null;

  const ir = async (destino) => { await flush(); navigate(destino); };
  const rutaDe = (n) => (n.tipo === 'portada'
    ? `/onboarding/${n.paso.skey}`
    : `/onboarding/${n.paso.skey}/${n.pantalla.id}`);

  const siguiente = () => {
    const prox = lista[idx + 1];
    return ir(prox ? rutaDe(prox) : '/onboarding/listo');
  };
  const atras = () => {
    const prev = lista[idx - 1];
    return ir(prev ? rutaDe(prev) : '/onboarding');
  };

  const p = nodo.paso;
  const bloque = bloques.find((b) => b.bkey === p.bkey);
  const contador = ancho
    ? `Paso ${nodo.i + 1} de ${pasos.length} · ${bloque?.nombre || ''}`
    : `Paso ${nodo.i + 1}/${pasos.length} · ${bloque?.corto || ''}`;

  // ── Portada del paso ───────────────────────────────────────────────────────
  if (nodo.tipo === 'portada') {
    const visibles = (p.preguntas || [])
      .filter((q) => visible(q, respuestas) && q.tipo !== 'info' && q.tipo !== 'resumen');
    const hayMic = visibles.some((q) => q.largo > 0);
    const cuenta = p.unaPorPantalla
      ? `${visibles.length} preguntas, una por pantalla`
      : visibles.length === 1 ? '1 pregunta' : `${visibles.length} preguntas`;

    return (
      <OnbShell
        contador={contador}
        pie={<Pie onAtras={atras} onSeguir={siguiente}
                  etiqueta={nodo.i === 0 || !ancho ? 'Empezar' : 'Empezar esta sección'} />}>
        <div style={{
          position: 'relative', overflow: 'hidden', borderRadius: 24, background: T.dark,
          padding: 'clamp(28px,6vw,46px)', animation: 'mkrise .4s ease both',
        }}>
          <div style={{
            position: 'absolute', top: -140, right: -120, width: 420, height: 420,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(72,120,255,.28) 0%, rgba(72,120,255,0) 68%)',
          }} />
          <div style={{
            position: 'absolute', top: 'clamp(14px,3vw,26px)', right: 'clamp(18px,4vw,34px)',
            fontFamily: FUENTE.display, fontSize: 'clamp(76px,16vw,132px)', fontWeight: 900,
            letterSpacing: '-.06em', lineHeight: .8, color: 'rgba(255,255,255,.055)',
          }}>{p.badge}</div>

          <div style={{ position: 'relative' }}>
            <div style={{
              width: 78, height: 78, borderRadius: '50%', background: 'rgba(72,120,255,.16)',
              border: '1px solid rgba(123,154,255,.32)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', marginBottom: 26,
              animation: 'mkpop .5s cubic-bezier(.4,0,.2,1) both',
            }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={T.azulClaro}
                   strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={p.icono} />
              </svg>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 14 }}>
              <span style={{ ...kicker(T.azulClaro, 10.5), letterSpacing: '.16em', fontWeight: 800 }}>
                {bloque?.nombre}
              </span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,.25)' }} />
              <span style={{ ...kicker(T.muted, 10.5), letterSpacing: '.13em', fontWeight: 600 }}>
                {p.eyebrow}
              </span>
            </div>

            <h1 style={{
              fontFamily: FUENTE.display, fontSize: 'clamp(32px,7.6vw,52px)', fontWeight: 800,
              letterSpacing: '-.038em', lineHeight: 1.02, color: '#fff', margin: '0 0 18px 0',
              overflowWrap: 'anywhere',
            }}>{p.titulo}</h1>
            <p style={{
              fontSize: 'clamp(15px,2.2vw,17px)', lineHeight: 1.6, color: T.faint,
              margin: '0 0 26px 0', maxWidth: 560,
            }}>{p.subtitulo}</p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
              <Pastilla>{cuenta}</Pastilla>
              <Pastilla>unos {p.minutos} min</Pastilla>
              {hayMic && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'rgba(72,120,255,.18)', border: '1px solid rgba(123,154,255,.3)',
                  borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 700,
                  color: '#9DB4FF',
                }}>Podés contestarlo hablando</div>
              )}
            </div>

            {/* El video de cada paso: si todavía no está grabado, el bloque
                simplemente no se renderiza. */}
            {p.video && (
              <div style={{ marginBottom: 28, borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9' }}>
                <iframe src={p.video} title={p.titulo} allowFullScreen
                        style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
              </div>
            )}

            {p.paraQue && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 24 }}>
                <div style={{
                  ...kicker(T.azulClaro, 10.5), letterSpacing: '.16em',
                  fontWeight: 800, marginBottom: 10,
                }}>Para qué sirve</div>
                <div style={{
                  fontFamily: FUENTE.display, fontSize: 'clamp(17px,3.1vw,23px)', fontWeight: 700,
                  letterSpacing: '-.022em', lineHeight: 1.34, color: '#F4F4F5', maxWidth: 600,
                }}>{p.paraQue}</div>
              </div>
            )}
          </div>
        </div>
      </OnbShell>
    );
  }

  // ── Pantalla de preguntas ──────────────────────────────────────────────────
  const preguntas = nodo.pantalla.preguntas;

  // Cuando el paso es de una pregunta por pantalla (la historia), el título de
  // la pantalla ES la pregunta: mostrar las dos sería decir lo mismo dos veces.
  const sola = p.unaPorPantalla && preguntas.length === 1;
  const conEtiqueta = preguntas.filter((q) => q.label).length;

  const obligatorias = preguntas.filter((q) => q.requerida);
  const puede = obligatorias.every((q) => lleno(q, respuestas, bloqueantes));
  const falta = obligatorias.find((q) => !lleno(q, respuestas, bloqueantes));

  // Control de calidad final: la ÚNICA pantalla que bloquea a propósito (ver la
  // cabecera del archivo). Acá el cliente confirma que terminó; dejarlo finalizar
  // con obligatorias vacías rompe la promesa. Si falta algo, el botón se desactiva
  // y "Continuar" lo lleva a la primera obligatoria sin completar.
  const esControl = preguntas.some((q) => q.tipo === 'resumen');
  const prog = esControl ? calcularProgreso(pasos, respuestas, bloqueantes) : null;
  const faltanObl = esControl ? Math.max(0, prog.requeridas - prog.respondidas) : 0;
  const primerFaltante = (esControl && faltanObl > 0)
    ? lista.find((n) => n.tipo === 'pregunta'
        && n.pantalla.preguntas.some((q) => q.requerida && visible(q, respuestas) && !lleno(q, respuestas, bloqueantes)))
    : null;
  const onSeguir = () => {
    if (esControl && faltanObl > 0) return primerFaltante ? ir(rutaDe(primerFaltante)) : undefined;
    return siguiente();
  };

  let pista = '';
  if (!puede && falta) {
    if (falta.largo) {
      const cuantos = minLargo(falta) - String(respuestas[falta.qkey]?.valor || '').trim().length;
      pista = `Necesitamos un poco más de detalle: faltan ${cuantos} caracteres. `
            + 'Contestalo hablando y lo resolvés en 30 segundos.';
    } else if (falta.tipo === 'opciones' || falta.tipo === 'chips_multi') {
      pista = 'Elegí una opción para seguir. Si no lo sabés, marcá la de «no lo sé»: nos sirve igual.';
    } else if (falta.tipo === 'archivos') {
      pista = 'Podés seguir y subirlo después: te lo volvemos a pedir al final.';
    } else if (falta.tipo === 'agenda') {
      pista = 'Elegí una fecha, o marcá que ya lo agendaste por otro lado.';
    } else {
      pista = 'Completá lo que falta para seguir. Si no lo sabés con certeza, decinos lo que sepas.';
    }
  }
  if (esControl && faltanObl > 0) {
    pista = `Te ${faltanObl === 1 ? 'falta 1 respuesta obligatoria' : `faltan ${faltanObl} respuestas obligatorias`} para finalizar. `
          + 'Tocá «Completar» en la sección que las tenga en rojo.';
  }

  const etiquetaPie = idx === lista.length - 1
    ? (ancho ? 'Todo correcto, finalizar' : 'Finalizar')
    : 'Continuar';

  let contadorPantalla = '';
  if (p.unaPorPantalla) {
    contadorPantalla = nodo.j === nodo.total - 1
      ? 'Autoridad pública · último paso'
      : `Pregunta ${nodo.j + 1} de ${nodo.total - 1}`;
  } else if (nodo.total > 1) {
    contadorPantalla = `Parte ${nodo.j + 1} de ${nodo.total}`;
  }

  // Agenda y resumen necesitan el estado entero del onboarding, así que se los
  // pasamos ya armados al despachador en vez de darle acceso al contexto.
  const extras = {
    agenda: (q) => (q.soloDia
      ? <CampoGrabacion q={q} valor={respuestas[q.qkey]?.valor || ''}
                        onChange={(v, o) => responder(q.qkey, v, o)} />
      : <CampoSesion q={q} valor={respuestas[q.qkey]?.valor || ''}
                     onChange={(v, o) => responder(q.qkey, v, o)} />),
    resumen: () => <Resumen onIr={ir} />,
  };

  return (
    <OnbShell
      contador={contador}
      pie={<Pie onAtras={atras} onSeguir={onSeguir} etiqueta={etiquetaPie}
                activo={esControl ? faltanObl === 0 : puede} pista={pista} />}>
      <div style={{ animation: 'mkrise .3s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: T.dark, color: '#fff',
            borderRadius: 999, padding: '6px 13px 6px 7px',
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', background: T.azulMarca,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800,
            }}>{p.badge}</span>
            <span style={{ ...kicker('inherit', 10.5), letterSpacing: '.1em' }}>{bloque?.corto}</span>
          </div>
          <div style={{ ...kicker(T.faint, 11), letterSpacing: '.09em', fontWeight: 600 }}>
            {p.eyebrow}
          </div>
        </div>

        <h1 style={{
          fontFamily: FUENTE.display, fontSize: 'clamp(25px,5.6vw,38px)', fontWeight: 800,
          letterSpacing: '-.032em', lineHeight: 1.08, margin: '0 0 12px 0',
          overflowWrap: 'anywhere',
        }}>{sola ? preguntas[0].label : p.titulo}</h1>

        {(sola ? preguntas[0].sublabel : (nodo.total > 1 ? p.subtitulo : '')) && (
          <p style={{
            fontSize: 'clamp(14px,2.1vw,16px)', lineHeight: 1.6, color: T.soft, margin: '0 0 8px 0',
          }}>{sola ? preguntas[0].sublabel : p.subtitulo}</p>
        )}

        {contadorPantalla && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: T.azulWash,
            ...kicker(T.azulTinta, 11), letterSpacing: '.08em',
            padding: '6px 12px', borderRadius: 999, marginBottom: 8,
          }}>{contadorPantalla}</div>
        )}

        <div style={{ height: 14 }} />

        {preguntas.map((q, i) => (
          <div key={q.qkey} style={{ marginBottom: 24 }}>
            <Campo
              q={sola ? { ...q, label: '', sublabel: '' } : q}
              numero={conEtiqueta > 1 && q.label
                ? preguntas.slice(0, i + 1).filter((x) => x.label).length : 0}
              valor={respuestas[q.qkey]?.valor || ''}
              valorJson={respuestas[q.qkey]?.valorJson}
              clientHint={estado?.runId}
              bloqueante={(bloqueantes || []).find((b) => b.bucket === q.bucket)}
              autoFocus={i === 0 && preguntas.length === 1 && q.tipo === 'corta'}
              extras={extras}
              onChange={(v, opts) => responder(q.qkey, v, opts)}
              onVoz={(texto) => {
                // Se APENDEA, nunca se reemplaza: si el cliente ya había escrito
                // algo, pisárselo sería el peor final posible para su esfuerzo.
                const previo = String(respuestas[q.qkey]?.valor || '').trim();
                responder(q.qkey, previo ? `${previo}\n\n${texto}` : texto,
                  { source: 'voz', flag: null, inmediato: true });
              }}
              onAudioPendiente={(path, meta) => {
                const previo = String(respuestas[q.qkey]?.valor || '').trim();
                responder(q.qkey, previo || '[Respuesta grabada en audio — la transcribimos nosotros]', {
                  source: 'voz', flag: 'audio_pendiente', audioPath: path,
                  audioMs: meta?.ms || null, inmediato: true,
                });
              }}
            />
          </div>
        ))}
      </div>
    </OnbShell>
  );
}

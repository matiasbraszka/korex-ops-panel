// ─────────────────────────────────────────────────────────────────────────────
// Una pantalla = una pregunta (o un grupo de preguntas cortas).
//
// La URL lleva el tramo y la pregunta, así el botón atrás del navegador
// funciona como el cliente espera y se puede volver a cualquier punto.
//
// LO MÁS IMPORTANTE DE ESTA PANTALLA: el botón "Siguiente" NUNCA se bloquea.
// Bloquear a alguien porque escribió poco lo humilla y hace que abandone, no
// que escriba más. Cuando la respuesta viene muy corta se abre una hoja que le
// ofrece contarlo hablando; si aun así quiere seguir, sigue — y esa pregunta
// vuelve a aparecer en el repaso, cuando ya agarró ritmo.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IcoMic, IcoArrowR } from '../../components/icons';
import { TO, F, btn, btnTexto, label } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import Hoja from '../components/Hoja';
import Campo from '../components/Campo';
import { pantallasDe, textoDuracion, segundosDeVoz } from '../progreso';

export default function PreguntaScreen() {
  const { tramo, qkey } = useParams();
  const navigate = useNavigate();
  const { secciones, tramos, respuestas, bloqueantes, prefill, responder, flush, estado } = useOnboarding();
  const [sheetCorta, setSheetCorta] = useState(null);

  const seccion = secciones.find((s) => s.skey === tramo);
  const pantallas = useMemo(
    () => (seccion ? pantallasDe(seccion, respuestas) : []),
    [seccion, respuestas],
  );
  const idx = pantallas.findIndex((p) => p.id === qkey);
  const pantalla = idx >= 0 ? pantallas[idx] : null;

  // Si la pregunta dejó de ser visible (cambió una respuesta de la que dependía),
  // no dejamos al cliente en una pantalla fantasma.
  useEffect(() => {
    if (seccion && !pantalla && pantallas.length) {
      navigate(`/onboarding/${tramo}/${pantallas[0].id}`, { replace: true });
    }
  }, [seccion, pantalla, pantallas, tramo, navigate]);

  if (!seccion || !pantalla) return null;

  const irA = async (destino) => { await flush(); navigate(destino); };

  // Al terminar un tramo se pasa DIRECTO a la portada del siguiente. Antes había
  // una pantalla de celebración en el medio ("Tu historia, listo · 23%") y no
  // aportaba nada: el anillo de progreso del header ya se mueve con cada
  // respuesta, así que la celebración le contaba al cliente algo que acababa de
  // ver, a cambio de un toque más.
  const siguiente = () => {
    if (idx + 1 < pantallas.length) return irA(`/onboarding/${tramo}/${pantallas[idx + 1].id}`);
    const i = tramos.findIndex((s) => s.skey === tramo);
    const proximo = tramos[i + 1];
    return irA(proximo ? `/onboarding/${proximo.skey}` : '/onboarding/repaso');
  };

  const anterior = () => {
    if (idx > 0) return irA(`/onboarding/${tramo}/${pantallas[idx - 1].id}`);
    return irA(`/onboarding/${tramo}`);
  };

  // Una respuesta por debajo del 45% del objetivo no alcanza para escribir nada
  // con ella. Antes de dejarla pasar, ofrecemos el micrófono una vez.
  const cortas = pantalla.preguntas.filter((q) => {
    if (q.tipo !== 'abierta' || !q.minChars || !q.requerida) return false;
    const len = String(respuestas[q.qkey]?.valor || '').trim().length;
    return len > 0 && len < q.minChars * 0.45;
  });

  const continuar = () => {
    if (cortas.length && !sheetCorta) { setSheetCorta(cortas[0]); return; }
    siguiente();
  };

  const seguirIgual = () => {
    // Se marca, no se pierde: reaparece en el repaso con el micrófono a mano.
    responder(sheetCorta.qkey, respuestas[sheetCorta.qkey]?.valor || '',
      { flag: 'corta', inmediato: true });
    setSheetCorta(null);
    siguiente();
  };

  const tramoIdx = tramos.findIndex((s) => s.skey === tramo);

  return (
    <OnbShell>
      <OnbHeader
        titulo={seccion.titulo}
        paso={idx + 1} total={pantallas.length}
        onVolver={anterior}
      />

      <div className="kxs" style={{ flex: 1, paddingTop: 24, paddingBottom: 30 }}>
        {tramoIdx === 0 && idx === 0 && (
          <div style={{ ...label(TO.blue), marginBottom: 16 }}>
            Tramo {tramoIdx + 1} de {tramos.length}
          </div>
        )}

        {/* Separador entre preguntas agrupadas: sin él, con varias cortas en una
            misma pantalla no se ve dónde termina una y empieza la otra. */}
        <div style={{ display: 'grid', gap: 34 }}>
          {pantalla.preguntas.map((q, i) => (
            <div key={q.qkey} style={i > 0
              ? { paddingTop: 30, borderTop: `1px solid ${TO.line}` }
              : undefined}>
            <Campo
              key={q.qkey}
              q={q}
              chico={pantalla.preguntas.length > 1}
              autoFocus={i === 0 && q.tipo !== 'abierta' && pantalla.preguntas.length === 1}
              valor={respuestas[q.qkey]?.valor || ''}
              valorJson={respuestas[q.qkey]?.valorJson}
              flag={respuestas[q.qkey]?.flag}
              prefill={prefill}
              clientHint={estado?.runId}
              bloqueante={(bloqueantes || []).find((b) => b.bucket === q.bucket)}
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
      </div>

      <OnbFooter>
        <button type="button" onClick={continuar} style={btn()}>
          {idx + 1 < pantallas.length ? 'SIGUIENTE'
            : tramos[tramoIdx + 1] ? `SEGUIR CON ${tramos[tramoIdx + 1].titulo.toUpperCase()}`
            : 'IR AL REPASO'}
          <IcoArrowR size={18} stroke="#fff" sw={2.4} />
        </button>
      </OnbFooter>

      {sheetCorta && (
        <SheetCorta
          q={sheetCorta}
          onCerrar={() => setSheetCorta(null)}
          onSeguir={seguirIgual}
        />
      )}
    </OnbShell>
  );
}

function SheetCorta({ q, onCerrar, onSeguir }) {
  const seg = segundosDeVoz(q.minChars);
  return (
    <Hoja
      titulo="Con esto todavía no nos alcanza"
      onCerrar={onCerrar}
      pie={(
        <>
          <button type="button" onClick={onCerrar} style={btn()}>
            <IcoMic size={19} stroke="#fff" sw={2.2} />
            CONTARLO HABLANDO
          </button>
          <button type="button" onClick={onSeguir} style={btnTexto}>
            Igual quiero seguir
          </button>
        </>
      )}
    >
      <div style={{ fontSize: F.sub, lineHeight: 1.65, color: TO.body }}>
        Con lo que escribiste no podemos escribir tu video ni tus anuncios.
        Contalo hablando: son <strong style={{ color: TO.ink }}>{textoDuracion(seg)}</strong> y
        sale mucho más natural que escribiendo.
      </div>
      <div style={{ fontSize: F.meta, color: TO.meta, marginTop: 14, lineHeight: 1.5 }}>
        Si preferís seguir, no pasa nada: te la volvemos a mostrar al final.
      </div>
    </Hoja>
  );
}

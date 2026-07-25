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
import { T, display, bigBtn } from '../../components/theme';
import { IcoMic, IcoArrowR } from '../../components/icons';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
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

  const siguiente = () => {
    if (idx + 1 < pantallas.length) return irA(`/onboarding/${tramo}/${pantallas[idx + 1].id}`);
    return irA(`/onboarding/${tramo}?cierre=1`);
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

      <div className="kxs" style={{ flex: 1, paddingTop: 22, paddingBottom: 28 }}>
        {tramoIdx === 0 && idx === 0 && (
          <div style={{
            ...display(15, '-0.01em'), color: T.primaryInk, marginBottom: 14,
            fontWeight: 700, fontSize: 13.5, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Tramo {tramoIdx + 1} de {tramos.length}
          </div>
        )}

        <div style={{ display: 'grid', gap: 30 }}>
          {pantalla.preguntas.map((q, i) => (
            <Campo
              key={q.qkey}
              q={q}
              chico={pantalla.preguntas.length > 1}
              autoFocus={i === 0 && q.tipo !== 'abierta' && pantalla.preguntas.length === 1}
              valor={respuestas[q.qkey]?.valor || ''}
              flag={respuestas[q.qkey]?.flag}
              prefill={prefill}
              clientHint={estado?.runId}
              bloqueante={(bloqueantes || []).find((b) => b.bucket === q.bucket)}
              onChange={(v) => responder(q.qkey, v)}
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
          ))}
        </div>
      </div>

      <OnbFooter>
        <button type="button" onClick={continuar} style={bigBtn(T.primary, 52)}>
          {idx + 1 < pantallas.length ? 'SIGUIENTE' : 'TERMINAR ESTE TRAMO'}
          <IcoArrowR size={17} stroke="#fff" />
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
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,22,40,.45)', zIndex: 60,
        display: 'flex', alignItems: 'flex-end', animation: 'kxFade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mk-sheet"
        style={{
          background: '#fff', borderRadius: '22px 22px 0 0', padding: '10px 22px 26px',
          animation: 'kxUp .26s ease', marginBottom: 0,
        }}
      >
        <div style={{ width: 44, height: 5, borderRadius: 999, background: T.border, margin: '0 auto 18px' }} />

        <div style={{ ...display(22, '-0.025em'), lineHeight: 1.2 }}>
          Con esto todavía no nos alcanza
        </div>
        <div style={{ fontSize: 15.5, lineHeight: 1.6, color: T.text2, marginTop: 10 }}>
          Con lo que escribiste no podemos escribir tu video ni tus anuncios.
          Contalo hablando: son <strong>{textoDuracion(seg)}</strong> y sale mucho
          más natural que escribiendo.
        </div>

        <button type="button" onClick={onCerrar} style={{ ...bigBtn(T.primary, 52), marginTop: 20 }}>
          <IcoMic size={18} stroke="#fff" />
          CONTARLO HABLANDO
        </button>

        <button type="button" onClick={onSeguir} style={{
          display: 'block', width: '100%', marginTop: 14, background: 'none', border: 'none',
          padding: '6px 0', cursor: 'pointer', fontSize: 14.5, color: T.text2,
        }}>
          Igual quiero seguir
        </button>
        <div style={{ fontSize: 13, color: T.text3, textAlign: 'center', marginTop: 4, lineHeight: 1.45 }}>
          No te preocupes, te la volvemos a mostrar al final.
        </div>
      </div>
    </div>
  );
}

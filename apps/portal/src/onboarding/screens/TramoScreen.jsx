// Portada y cierre de tramo.
//
// Es donde vive casi toda la dopamina del onboarding, y por una razón: si
// celebráramos cada respuesta, para la pregunta 30 el cliente odiaría la
// animación. Se celebra cinco veces, y siempre con una CONSECUENCIA CONCRETA
// ("con esto ya podemos escribir tu VSL") en vez de un elogio vacío. El refuerzo
// tiene que ser información, no palmadita.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { T, display, bigBtn, microLabel } from '../../components/theme';
import { IcoCheck, IcoArrowR, IcoClock, IcoPlay } from '../../components/icons';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { pantallasDe, tramoCompleto } from '../progreso';

export default function TramoScreen() {
  const { tramo } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const esCierre = params.get('cierre') === '1';

  const { secciones, tramos, respuestas, bloqueantes, minutos, progreso, flush, cortas } = useOnboarding();
  const seccion = secciones.find((s) => s.skey === tramo);

  const [pctAnim, setPctAnim] = useState(progreso.pct);
  useEffect(() => {
    if (!esCierre) { setPctAnim(progreso.pct); return; }
    // Arranca donde estaba y sube: ver el número moverse es media celebración.
    const t = setTimeout(() => setPctAnim(progreso.pct), 260);
    return () => clearTimeout(t);
  }, [esCierre, progreso.pct]);

  if (!seccion) return null;

  const i = tramos.findIndex((s) => s.skey === tramo);
  const pantallas = pantallasDe(seccion, respuestas);
  const completo = tramoCompleto(seccion, respuestas, bloqueantes);
  const siguiente = tramos[i + 1];

  const ir = async (destino) => { await flush(); navigate(destino); };

  const irAlSiguiente = () => {
    if (siguiente) return ir(`/onboarding/${siguiente.skey}`);
    return ir('/onboarding/repaso');
  };

  // ── Cierre ─────────────────────────────────────────────────────────────────
  if (esCierre) {
    return (
      <OnbShell>
        <OnbHeader titulo={seccion.titulo} ocultarProgreso onVolver={() => navigate(`/onboarding/${tramo}`)} />
        <div className="kxs" style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', paddingBottom: 30, textAlign: 'center',
        }}>
          <div style={{ animation: 'kxUp .4s ease' }}>
            <div style={{
              width: 68, height: 68, borderRadius: '50%', margin: '0 auto 22px',
              background: completo ? T.green : T.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'kxPop .55s ease',
            }}>
              <IcoCheck size={31} stroke="#fff" sw={2.6} />
            </div>

            <div style={{ ...display(27, '-0.03em'), lineHeight: 1.15 }}>
              {completo ? `${seccion.titulo}, listo.` : `Guardamos ${seccion.titulo.toLowerCase()}.`}
            </div>

            {seccion.promesa && (
              <div style={{
                fontSize: 16.5, lineHeight: 1.55, color: T.textSoft,
                marginTop: 12, maxWidth: 400, marginInline: 'auto',
              }}>{seccion.promesa}</div>
            )}

            {/* La barra global moviéndose de verdad, con el número contando. */}
            <div style={{ maxWidth: 320, margin: '28px auto 0' }}>
              <div style={{
                fontFamily: "'Montserrat', sans-serif", fontSize: 38, fontWeight: 800,
                letterSpacing: '-0.035em', color: T.ink, lineHeight: 1,
              }}>{pctAnim}%</div>
              <div style={{ height: 7, borderRadius: 999, background: T.surface2, marginTop: 12, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 999, background: T.primary,
                  width: `${pctAnim}%`, transition: 'width .7s cubic-bezier(.22,1,.36,1)',
                }} />
              </div>
              {minutos > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 14, color: T.text2, marginTop: 12,
                }}>
                  <IcoClock size={15} stroke={T.text2} />
                  Te quedan unos {minutos} minutos
                </div>
              )}
            </div>

            {seccion.desbloquea && completo && (
              <div style={{
                marginTop: 24, padding: '13px 16px', borderRadius: 15,
                background: T.greenSoft, maxWidth: 400, marginInline: 'auto',
                fontSize: 14.5, lineHeight: 1.55, color: '#166534',
              }}>
                Se te desbloqueó una sección nueva de la plataforma. La vas a ver
                cuando termines.
              </div>
            )}
          </div>
        </div>

        <OnbFooter>
          <button type="button" onClick={irAlSiguiente} style={bigBtn(T.primary, 52)}>
            {siguiente ? 'SEGUIR' : 'IR AL REPASO'}
            <IcoArrowR size={17} stroke="#fff" />
          </button>

          {/* Dar permiso explícito de parar BAJA el abandono: elimina la sensación
              de estar atrapado en un formulario que no termina más. */}
          {seccion.checkpoint && (
            <button type="button" onClick={() => ir('/')} style={{
              display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none',
              padding: '6px 0', cursor: 'pointer', fontSize: 14.5, color: T.text2,
            }}>
              Continuar más tarde
            </button>
          )}
        </OnbFooter>
      </OnbShell>
    );
  }

  // ── Portada ────────────────────────────────────────────────────────────────
  const primera = pantallas[0];
  return (
    <OnbShell>
      <OnbHeader titulo={`Tramo ${i + 1} de ${tramos.length}`} onVolver={() => navigate('/onboarding')} />

      <div className="kxs" style={{ flex: 1, paddingTop: 26, paddingBottom: 30 }}>
        <div style={{ ...microLabel(T.primaryInk), marginBottom: 10 }}>
          {completo ? 'Ya lo completaste' : `Unos ${seccion.minutos} minutos`}
        </div>

        <div style={{ ...display(30, '-0.035em'), lineHeight: 1.12 }}>{seccion.titulo}</div>

        {seccion.subtitulo && (
          <div style={{ fontSize: 16.5, lineHeight: 1.55, color: T.text2, marginTop: 12, textWrap: 'pretty' }}>
            {seccion.subtitulo}
          </div>
        )}

        {/* El video se renderiza solo si existe: al lanzar todavía no están
            grabados, y un marco vacío se ve peor que ningún video. */}
        {seccion.video && <VideoTramo url={seccion.video} />}

        {seccion.promesa && (
          <div style={{
            marginTop: 20, padding: '15px 17px', borderRadius: 16,
            background: T.primaryWash, border: '1px solid #E3E9FB',
          }}>
            <div style={{ ...microLabel(T.primaryInk), marginBottom: 6 }}>Para qué sirve</div>
            <div style={{ fontSize: 15.5, lineHeight: 1.55, color: T.textSoft }}>{seccion.promesa}</div>
          </div>
        )}

        {seccion.intro && (
          <div style={{ fontSize: 15.5, lineHeight: 1.6, color: T.textSoft, marginTop: 18, whiteSpace: 'pre-wrap' }}>
            {seccion.intro}
          </div>
        )}

        <div style={{ fontSize: 14, color: T.text3, marginTop: 20 }}>
          {pantallas.length} {pantallas.length === 1 ? 'pregunta' : 'preguntas'} · se guarda solo
        </div>
      </div>

      <OnbFooter>
        <button
          type="button"
          onClick={() => primera && ir(`/onboarding/${tramo}/${primera.id}`)}
          style={bigBtn(completo ? T.ink : T.primary, 52)}
        >
          {completo ? 'REVISAR MIS RESPUESTAS' : 'EMPEZAR'}
          <IcoArrowR size={17} stroke="#fff" />
        </button>
      </OnbFooter>
    </OnbShell>
  );
}

function VideoTramo({ url }) {
  const [play, setPlay] = useState(false);
  return (
    <div style={{
      marginTop: 20, position: 'relative', width: '100%', aspectRatio: '16 / 9',
      borderRadius: 18, overflow: 'hidden', background: '#E4E8EF',
    }}>
      {play ? (
        <iframe
          src={`${url}${url.includes('?') ? '&' : '?'}autoplay=true`}
          title="Cómo completar este tramo"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      ) : (
        // Nunca autoplay: mucha gente entra desde el celular con datos móviles.
        <button type="button" onClick={() => setPlay(true)} style={{
          position: 'absolute', inset: 0, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#EEF2FF,#E4E8EF)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 10,
        }}>
          <span style={{
            width: 56, height: 56, borderRadius: '50%', background: T.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 22px rgba(91,124,245,.34)',
          }}><IcoPlay size={24} /></span>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
            Mirá el video (menos de 1 minuto)
          </span>
        </button>
      )}
    </div>
  );
}

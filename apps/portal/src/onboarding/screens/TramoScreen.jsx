// Portada y cierre de tramo.
//
// Es donde vive casi toda la dopamina del onboarding, y por una razón: si
// celebráramos cada respuesta, para la pregunta 30 el cliente odiaría la
// animación. Se celebra cinco veces, y siempre con una CONSECUENCIA CONCRETA
// ("con esto ya podemos escribir tu VSL") en vez de un elogio vacío. El refuerzo
// tiene que ser información, no palmadita.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IcoCheck, IcoArrowR, IcoClock, IcoPlay, IcoImage } from '../../components/icons';
import { TO, F, dsp, btn, btnTexto, label } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { pantallasDe, tramoCompleto } from '../progreso';

export default function TramoScreen() {
  const { tramo } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const esCierre = params.get('cierre') === '1';

  const { secciones, tramos, respuestas, bloqueantes, minutos, progreso, flush, checklist } = useOnboarding();
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
    // El recordatorio del material se muestra al cerrar el ANTEÚLTIMO tramo:
    // es el último momento útil para juntarlo antes de que se lo pidamos.
    const avisarMaterial = siguiente?.skey === 'material' && (checklist || []).length > 0;

    return (
      <OnbShell>
        <OnbHeader titulo={seccion.titulo} ocultarProgreso onVolver={() => navigate(`/onboarding/${tramo}`)} />
        <div className="kxs" style={{ flex: 1, paddingTop: 34, paddingBottom: 30, textAlign: 'center' }}>
          <div style={{ animation: 'kxUp .4s ease' }}>
            <div style={{
              width: 74, height: 74, borderRadius: '50%', margin: '0 auto 24px',
              background: completo ? TO.greenInk : TO.blueBtn,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'kxPop .55s ease',
            }}>
              <IcoCheck size={34} stroke="#fff" sw={2.6} />
            </div>

            <div style={{ ...dsp(F.h2), lineHeight: 1.18 }}>
              {completo ? `${seccion.titulo}, listo.` : `Guardamos ${seccion.titulo.toLowerCase()}.`}
            </div>

            {seccion.promesa && (
              <div style={{
                fontSize: F.body, lineHeight: 1.55, color: TO.body,
                marginTop: 14, maxWidth: 420, marginInline: 'auto',
              }}>{seccion.promesa}</div>
            )}

            {/* La barra global moviéndose de verdad, con el número contando. */}
            <div style={{ maxWidth: 340, margin: '30px auto 0' }}>
              <div style={{
                fontFamily: "'Montserrat', sans-serif", fontSize: 44, fontWeight: 800,
                letterSpacing: '-0.035em', color: TO.ink, lineHeight: 1,
              }}>{pctAnim}%</div>
              <div style={{ height: 10, borderRadius: 999, background: TO.fill, marginTop: 14, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 999, background: TO.blueBtn,
                  width: `${pctAnim}%`, transition: 'width .7s cubic-bezier(.22,1,.36,1)',
                }} />
              </div>
              {minutos > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  fontSize: F.meta, fontWeight: 600, color: TO.meta, marginTop: 14,
                }}>
                  <IcoClock size={17} stroke={TO.meta} />
                  Te quedan unos {minutos} minutos
                </div>
              )}
            </div>

            {avisarMaterial && (
              <div style={{
                marginTop: 28, padding: '17px 18px', borderRadius: 18, textAlign: 'left',
                background: TO.blueWash, border: `2px solid ${TO.blueLine}`,
                maxWidth: 440, marginInline: 'auto',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <IcoImage size={20} stroke={TO.blue} sw={2.2} />
                  <div style={{ fontSize: 17, fontWeight: 800, color: TO.ink, letterSpacing: '-0.01em' }}>
                    Último paso: tu material
                  </div>
                </div>
                {checklist.filter((c) => c.requerido).map((c) => (
                  <div key={c.qkey} style={{
                    fontSize: F.meta, lineHeight: 1.5, color: TO.body, marginTop: 5,
                  }}>· {c.texto}</div>
                ))}
              </div>
            )}

            {seccion.desbloquea && completo && (
              <div style={{
                marginTop: 26, padding: '15px 17px', borderRadius: 16,
                background: TO.greenWash, border: '1px solid #A7DFBE',
                maxWidth: 420, marginInline: 'auto',
                fontSize: F.meta, lineHeight: 1.55, color: TO.greenInk, fontWeight: 600,
              }}>
                Se te desbloqueó una sección nueva de la plataforma. La vas a ver
                cuando termines.
              </div>
            )}
          </div>
        </div>

        <OnbFooter>
          <button type="button" onClick={irAlSiguiente} style={btn()}>
            {siguiente ? 'SEGUIR' : 'IR AL REPASO'}
            <IcoArrowR size={18} stroke="#fff" sw={2.4} />
          </button>

          {/* Dar permiso explícito de parar BAJA el abandono: elimina la sensación
              de estar atrapado en un formulario que no termina más. */}
          {seccion.checkpoint && (
            <button type="button" onClick={() => ir('/')} style={btnTexto}>
              Continuar más tarde
            </button>
          )}
        </OnbFooter>
      </OnbShell>
    );
  }

  // ── Portada ────────────────────────────────────────────────────────────────
  const primera = pantallas[0];
  const requeridas = (seccion.preguntas || []).filter((q) => q.requerida).length;

  return (
    <OnbShell>
      <OnbHeader titulo={`Tramo ${i + 1} de ${tramos.length}`} onVolver={() => navigate('/onboarding')} />

      <div className="kxs" style={{ flex: 1, paddingTop: 28, paddingBottom: 30 }}>
        <div style={{ ...label(TO.blue), marginBottom: 11 }}>
          {completo ? 'Ya lo completaste' : `Unos ${seccion.minutos} minutos`}
        </div>

        <div style={{ ...dsp(F.h1, '-0.035em'), lineHeight: 1.12 }}>{seccion.titulo}</div>

        {seccion.subtitulo && (
          <div style={{ fontSize: F.body, lineHeight: 1.55, color: TO.body, marginTop: 13, textWrap: 'pretty' }}>
            {seccion.subtitulo}
          </div>
        )}

        {/* El video se renderiza solo si existe: al lanzar todavía no están
            grabados, y un marco vacío se ve peor que ningún video. */}
        {seccion.video && <VideoTramo url={seccion.video} />}

        {seccion.promesa && (
          <div style={{
            marginTop: 22, padding: '16px 18px', borderRadius: 16,
            background: TO.blueWash, border: `1px solid ${TO.blueLine}`,
          }}>
            <div style={{ ...label(TO.blue), marginBottom: 7 }}>Para qué sirve</div>
            <div style={{ fontSize: F.sub, lineHeight: 1.55, color: TO.body }}>{seccion.promesa}</div>
          </div>
        )}

        {seccion.intro && (
          <div style={{ fontSize: F.sub, lineHeight: 1.6, color: TO.body, marginTop: 20, whiteSpace: 'pre-wrap' }}>
            {seccion.intro}
          </div>
        )}

        <div style={{
          fontSize: F.meta, fontWeight: 600, color: TO.meta, marginTop: 22,
          paddingTop: 18, borderTop: `1px solid ${TO.line}`,
        }}>
          {pantallas.length} {pantallas.length === 1 ? 'pantalla' : 'pantallas'}
          {requeridas > 0 && ` · ${requeridas} ${requeridas === 1 ? 'pregunta' : 'preguntas'}`}
          {' · se guarda solo'}
        </div>
      </div>

      <OnbFooter>
        <button
          type="button"
          onClick={() => primera && ir(`/onboarding/${tramo}/${primera.id}`)}
          style={btn(completo ? TO.ink : TO.blueBtn)}
        >
          {completo ? 'REVISAR MIS RESPUESTAS' : 'EMPEZAR'}
          <IcoArrowR size={18} stroke="#fff" sw={2.4} />
        </button>
      </OnbFooter>
    </OnbShell>
  );
}

function VideoTramo({ url }) {
  const [play, setPlay] = useState(false);
  return (
    <div style={{
      marginTop: 22, position: 'relative', width: '100%', aspectRatio: '16 / 9',
      borderRadius: 18, overflow: 'hidden', background: '#DDE2EA',
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
          background: 'linear-gradient(135deg,#E4EBFF,#DDE2EA)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 12,
        }}>
          <span style={{
            width: 62, height: 62, borderRadius: '50%', background: TO.blueBtn,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 22px rgba(74,103,216,.3)',
          }}><IcoPlay size={26} /></span>
          <span style={{ fontSize: 16, fontWeight: 800, color: TO.ink }}>
            Mirá el video (menos de 1 minuto)
          </span>
        </button>
      )}
    </div>
  );
}

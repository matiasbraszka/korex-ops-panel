// Punto de entrada de /onboarding.
//
// El magic link del mail cae acá, así que esta pantalla tiene que resolver sola
// en qué parte del recorrido está el cliente y llevarlo ahí. Solo la primera
// vez muestra la bienvenida; después va directo a donde dejó, porque hacerle
// leer la misma introducción cada vez que vuelve es una fricción gratuita.
//
// LA LISTA DE MATERIAL VA ACÁ, ANTES DE LA PRIMERA PREGUNTA. El material se
// sube en el último tramo (como en el documento de onboarding), y lo único que
// evita que el cliente llegue ahí sin nada es que sepa desde el minuto cero qué
// va a necesitar. Verlo al principio y subirlo al final es distinto de que se
// lo pidan de sorpresa a los 90 minutos.
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { IcoArrowR, IcoMic, IcoCheck, IcoClock, IcoImage } from '../../components/icons';
import { Loading } from '../../components/ui';
import { TO, F, dsp, btn, label } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { tramoCompleto } from '../progreso';

const VISTO = 'korex_onb_bienvenida';

export default function OnboardingIndex() {
  const navigate = useNavigate();
  const { cargando, error, recargar, tramos, respuestas, bloqueantes,
    agenda, completo, prefill, minutos, checklist } = useOnboarding();

  const yaVioBienvenida = typeof localStorage !== 'undefined' && localStorage.getItem(VISTO) === '1';

  // Ya arrancó: lo llevamos a donde dejó sin mostrarle nada más.
  useEffect(() => {
    if (cargando || error || completo) return;
    if (!yaVioBienvenida) return;
    if (agenda?.estado === 'pendiente') { navigate('/onboarding/agendar', { replace: true }); return; }
    const pendiente = tramos.find((s) => !tramoCompleto(s, respuestas, bloqueantes));
    navigate(pendiente ? `/onboarding/${pendiente.skey}` : '/onboarding/repaso', { replace: true });
  }, [cargando, error, completo, yaVioBienvenida, agenda?.estado, tramos, respuestas, bloqueantes, navigate]);

  if (cargando) {
    return <OnbShell indice={false}><div style={{ margin: 'auto' }}>
      <Loading label="Abriendo tu onboarding…" />
    </div></OnbShell>;
  }

  if (error) {
    return (
      <OnbShell indice={false}>
        <div className="kxs" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ ...dsp(F.h2), lineHeight: 1.2 }}>No pudimos abrir tu onboarding</div>
          <div style={{ fontSize: F.body, color: TO.body, marginTop: 12, lineHeight: 1.55 }}>
            Puede ser la conexión. Probá de nuevo; si sigue igual, escribinos por WhatsApp.
          </div>
          <button type="button" onClick={recargar} style={{ ...btn(), marginTop: 24 }}>
            PROBAR DE NUEVO
          </button>
        </div>
      </OnbShell>
    );
  }

  if (completo) return <Navigate to="/onboarding/listo" replace />;
  if (yaVioBienvenida) return null;   // el efecto ya está navegando

  const empezar = () => {
    try { localStorage.setItem(VISTO, '1'); } catch { /* incógnito */ }
    navigate(agenda?.estado === 'pendiente' ? '/onboarding/agendar'
      : tramos[0] ? `/onboarding/${tramos[0].skey}` : '/onboarding/repaso');
  };

  const primer = String(prefill?.nombre || '').split(/\s+/)[0];
  const obligatorio = (checklist || []).filter((c) => c.requerido);
  const opcional = (checklist || []).filter((c) => !c.requerido);

  return (
    <OnbShell indice={false}>
      <OnbHeader titulo="Bienvenido" ocultarProgreso onVolver={() => navigate('/')} />
      <div className="kxs" style={{ flex: 1, paddingTop: 28, paddingBottom: 32 }}>
        <div style={{ ...dsp(F.h1, '-0.035em'), lineHeight: 1.12 }}>
          {primer ? `${primer}, empecemos.` : 'Empecemos.'}
        </div>
        <div style={{ fontSize: F.body, lineHeight: 1.6, color: TO.body, marginTop: 14, textWrap: 'pretty' }}>
          Necesitamos conocer tu negocio en profundidad para poder escribir tus
          anuncios, tu video de ventas y tus páginas. Todo lo que nos cuentes acá
          se convierte en eso.
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 28 }}>
          <Punto icono={<IcoClock size={21} stroke={TO.blue} sw={2.2} />}
            titulo={`Unos ${minutos || 40} minutos`}
            texto="Lo podés hacer en varias veces. Se guarda solo, pregunta por pregunta: nunca perdés lo que ya escribiste." />
          <Punto icono={<IcoMic size={21} stroke={TO.blue} sw={2.2} />}
            titulo="Contestá hablando"
            texto="Casi todas las preguntas tienen micrófono. Hablás y nosotros lo pasamos a texto: es más rápido y sale mucho más natural." />
          <Punto icono={<IcoCheck size={21} stroke={TO.blue} sw={2.6} />}
            titulo="No hace falta que quede perfecto"
            texto="Contalo como se lo contarías a un amigo. Después lo repasamos juntos en tu sesión." />
        </div>

        {/* ── Lo que va a necesitar ──────────────────────────────────────────
            Va antes de empezar, no al final. El cliente lo lee, lo junta
            mientras contesta, y cuando llega al último tramo ya lo tiene. */}
        {obligatorio.length > 0 && (
          <div style={{
            marginTop: 28, borderRadius: 20, overflow: 'hidden',
            border: `2px solid ${TO.blueLine}`, background: '#fff',
          }}>
            <div style={{
              padding: '16px 18px', background: TO.blueWash,
              borderBottom: `1px solid ${TO.blueLine}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <IcoImage size={21} stroke={TO.blue} sw={2.2} />
                <div style={{ ...dsp(19, '-0.02em'), lineHeight: 1.25 }}>
                  Andá juntando esto
                </div>
              </div>
              <div style={{ fontSize: F.meta, lineHeight: 1.55, color: TO.body, marginTop: 8 }}>
                Te lo vamos a pedir al final, en el último tramo. Si lo tenés a
                mano desde ahora, lo subís en dos minutos.
              </div>
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {obligatorio.map((c, i) => (
                <ItemChecklist key={c.qkey} texto={c.texto} borde={i > 0} />
              ))}
            </ul>

            {opcional.length > 0 && (
              <div style={{ padding: '14px 18px', borderTop: `1px solid ${TO.line}`, background: TO.bg }}>
                <div style={{ ...label(), marginBottom: 8 }}>Si los tenés, mejor</div>
                {opcional.map((c) => (
                  <div key={c.qkey} style={{
                    fontSize: F.meta, color: TO.meta, lineHeight: 1.5, marginTop: 4,
                  }}>· {c.texto}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <OnbFooter>
        <button type="button" onClick={empezar} style={btn()}>
          EMPEZAR <IcoArrowR size={18} stroke="#fff" sw={2.4} />
        </button>
      </OnbFooter>
    </OnbShell>
  );
}

function ItemChecklist({ texto, borde }) {
  return (
    <li style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', padding: '15px 18px',
      borderTop: borde ? `1px solid ${TO.line}` : 'none',
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 8, flex: 'none', marginTop: 1,
        border: `2px solid ${TO.lineStrong}`, background: '#fff',
      }} />
      <span style={{ fontSize: F.sub, lineHeight: 1.5, color: TO.ink, fontWeight: 600 }}>
        {texto}
      </span>
    </li>
  );
}

function Punto({ icono, titulo, texto }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '17px 18px', background: '#fff',
      borderRadius: 18, border: `1px solid ${TO.line}`,
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 14, background: TO.blueWash, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icono}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17.5, fontWeight: 800, color: TO.ink, letterSpacing: '-0.01em' }}>
          {titulo}
        </div>
        <div style={{ fontSize: F.meta, lineHeight: 1.55, color: TO.body, marginTop: 4 }}>{texto}</div>
      </div>
    </div>
  );
}

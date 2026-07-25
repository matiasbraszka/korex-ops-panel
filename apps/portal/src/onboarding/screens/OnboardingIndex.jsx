// Punto de entrada de /onboarding.
//
// El magic link del mail cae acá, así que esta pantalla tiene que resolver sola
// en qué parte del recorrido está el cliente y llevarlo ahí. Solo la primera
// vez muestra la bienvenida; después va directo a donde dejó, porque hacerle
// leer la misma introducción cada vez que vuelve es una fricción gratuita.
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { T, display, bigBtn } from '../../components/theme';
import { IcoArrowR, IcoMic, IcoCheck, IcoClock } from '../../components/icons';
import { Loading } from '../../components/ui';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { tramoCompleto } from '../progreso';

const VISTO = 'korex_onb_bienvenida';

export default function OnboardingIndex() {
  const navigate = useNavigate();
  const { cargando, error, recargar, tramos, respuestas, bloqueantes,
    agenda, completo, prefill, minutos } = useOnboarding();

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
          <div style={{ ...display(22, '-0.025em'), lineHeight: 1.25 }}>No pudimos abrir tu onboarding</div>
          <div style={{ fontSize: 15.5, color: T.text2, marginTop: 10, lineHeight: 1.55 }}>
            Puede ser la conexión. Probá de nuevo; si sigue igual, escribinos por WhatsApp.
          </div>
          <button type="button" onClick={recargar} style={{ ...bigBtn(T.primary, 50), marginTop: 22 }}>
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

  return (
    <OnbShell indice={false}>
      <OnbHeader titulo="Bienvenido" ocultarProgreso onVolver={() => navigate('/')} />
      <div className="kxs" style={{ flex: 1, paddingTop: 30, paddingBottom: 30 }}>
        <div style={{ ...display(31, '-0.035em'), lineHeight: 1.12 }}>
          {primer ? `${primer}, empecemos.` : 'Empecemos.'}
        </div>
        <div style={{ fontSize: 16.5, lineHeight: 1.6, color: T.text2, marginTop: 13, textWrap: 'pretty' }}>
          Necesitamos conocer tu negocio en profundidad para poder escribir tus
          anuncios, tu video de ventas y tus páginas. Todo lo que nos cuentes acá
          se convierte en eso.
        </div>

        <div style={{ display: 'grid', gap: 11, marginTop: 26 }}>
          <Punto icono={<IcoClock size={19} stroke={T.primaryInk} />}
            titulo={`Unos ${minutos || 40} minutos`}
            texto="Lo podés hacer en varias veces. Se guarda solo, pregunta por pregunta." />
          <Punto icono={<IcoMic size={19} stroke={T.primaryInk} />}
            titulo="Contestá hablando"
            texto="Casi todas las preguntas tienen micrófono. Hablás y nosotros lo pasamos a texto: es más rápido y sale mucho más natural." />
          <Punto icono={<IcoCheck size={19} stroke={T.primaryInk} />}
            titulo="No hace falta que quede perfecto"
            texto="Contalo como se lo contarías a un amigo. Después lo repasamos juntos en tu sesión." />
        </div>
      </div>
      <OnbFooter>
        <button type="button" onClick={empezar} style={bigBtn(T.primary, 52)}>
          EMPEZAR <IcoArrowR size={17} stroke="#fff" />
        </button>
      </OnbFooter>
    </OnbShell>
  );
}

function Punto({ icono, titulo, texto }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '16px 17px', background: '#fff',
      borderRadius: 18, boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 14, background: T.primarySoft, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icono}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>{titulo}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55, color: T.text2, marginTop: 3 }}>{texto}</div>
      </div>
    </div>
  );
}

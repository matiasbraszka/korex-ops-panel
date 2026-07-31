// Cartel del modo prueba.
//
// Es feo a propósito: negro, fijo arriba de todo, imposible de confundir con la
// interfaz real. La peor falla posible de un modo prueba es que alguien crea
// que está probando cuando en realidad está reservando una cita de verdad, o al
// revés. Por eso el cartel dice siempre en qué modo está y qué implica.
import { useEffect, useRef, useState } from 'react';
import { DEMO_DISPONIBLE, demoActivo, demoCambiar, demoReset } from '../demo';

export default function BarraDemo() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  // El cartel empuja el onboarding hacia abajo, y el onboarding mide 100dvh:
  // sin esto la suma se pasa de la ventana y el pie —donde está "Continuar"—
  // queda fuera de la pantalla. Publica su alto real para que el armazón se lo
  // descuente. Es una variable CSS y no un cálculo fijo porque el cartel se
  // parte en dos líneas cuando la ventana es angosta.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => document.documentElement.style
      .setProperty('--kx-demo-alto', `${el.offsetHeight}px`);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => {
      obs.disconnect();
      document.documentElement.style.removeProperty('--kx-demo-alto');
    };
  }, [abierto]);

  if (!DEMO_DISPONIBLE) return null;          // en producción no existe

  const on = demoActivo();

  const cambiar = (v) => { demoCambiar(v); window.location.reload(); };
  const borrar = () => { demoReset(); window.location.reload(); };

  return (
    <div ref={ref} style={{
      flex: 'none', background: on ? '#0B0F17' : '#7A1414', color: '#fff',
      fontSize: 13, lineHeight: 1.35, padding: '9px 14px',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
        background: on ? '#F5C542' : '#fff', color: '#0B0F17',
        padding: '4px 9px', borderRadius: 999, flex: 'none',
      }}>{on ? 'Modo prueba' : 'Modo real'}</span>

      <span style={{ flex: 1, minWidth: 180 }}>
        {on
          ? 'Toca lo que quieras: no se reserva nada, no se envía ningún WhatsApp y no se guarda en el cliente.'
          : 'CUIDADO: reservar agenda de verdad, terminar escribe el cerebro y avisa por Slack.'}
      </span>

      <button type="button" onClick={() => setAbierto((v) => !v)} style={btnBarra}>
        {abierto ? 'Cerrar' : 'Qué se simula'}
      </button>
      <button type="button" onClick={borrar} style={btnBarra}>Borrar mis pruebas</button>
      <button type="button" onClick={() => cambiar(!on)} style={{
        ...btnBarra, background: on ? '#7A1414' : '#F5C542', color: on ? '#fff' : '#0B0F17',
        borderColor: 'transparent', fontWeight: 800,
      }}>
        {on ? 'Pasar a modo real' : 'Volver a modo prueba'}
      </button>

      {abierto && (
        <div style={{
          width: '100%', marginTop: 8, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,.22)',
          display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
        }}>
          <div>
            <div style={titulo}>No sale nada de este navegador</div>
            <div style={cuerpo}>
              Guardar respuestas · reservar el horario · “ya la agendé” ·
              subir archivos · guardar audios · terminar el onboarding
            </div>
          </div>
          <div>
            <div style={titulo}>Sí es real (solo lectura)</div>
            <div style={cuerpo}>
              Las preguntas y ejemplos · tus datos precargados · los horarios
              libres del calendario · la transcripción del micrófono
            </div>
          </div>
          <div>
            <div style={titulo}>Cómo se prende y se apaga</div>
            <div style={cuerpo}>
              Con los botones de aquí, o agregando <code>?demo=1</code> /
              <code> ?demo=0</code> a la URL. Queda guardado en este navegador.
              En producción este cartel no existe.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnBarra = {
  background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,.45)',
  borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: 700,
  cursor: 'pointer', flex: 'none', fontFamily: 'inherit',
};

const titulo = {
  fontSize: 11, fontWeight: 800, letterSpacing: '0.09em',
  textTransform: 'uppercase', opacity: 0.72, marginBottom: 4,
};

const cuerpo = { fontSize: 12.5, lineHeight: 1.5, opacity: 0.92 };

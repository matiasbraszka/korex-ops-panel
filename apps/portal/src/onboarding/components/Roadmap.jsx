// El "roadmap" del servicio: cómo trabajamos, con los plazos reales. Un timeline
// vertical (nodos numerados + conectores + tarjetas por fase) y, abajo, dos
// aclaraciones clave: el cronómetro de grabación y que los plazos son en días
// hábiles y se pausan cuando dependen del cliente.
//
// El contenido sale de las Reglas del servicio. NO es "15 días": el trabajo de
// Korex para los dos embudos lleva ~20 a 30 días hábiles, sin contar demoras
// del cliente (subir material, revisar, grabarse).
import { T, FUENTE, kicker } from '../tokens';
import { IcoClock, IcoCalendar } from '../../components/icons';

export const FASES = [
  { n: 1, cuando: 'Arranque', titulo: 'Inicio del servicio',
    desc: 'Se oficializa con el contrato de prestación de servicios firmado y tu primer pago hecho.', color: '#5B7CF5' },
  { n: 2, cuando: '7 a 10 días hábiles desde el onboarding', titulo: 'Primera entrega',
    desc: 'Estrategia, avatar, guiones de anuncios y VSL de tu primer embudo.', color: '#8B5CF6' },
  { n: 3, cuando: '7 a 10 días hábiles desde tu grabación', titulo: 'Entrega para lanzamiento',
    desc: 'Edición de tus anuncios y diseño de la landing de tu primer embudo.', color: '#F97316', tuParte: true },
  { n: 4, cuando: 'Cuando está todo armado', titulo: 'Presentación del sistema Korex',
    desc: 'Te mostramos el sistema completo, listo para salir a la calle.', color: '#06B6D4' },
  { n: 5, cuando: 'Salida a la calle', titulo: 'Lanzamiento del primer embudo',
    desc: 'Encendemos las campañas y tu primer embudo sale a pauta.', color: '#0EA5E9' },
  { n: 6, cuando: 'Hasta lograrlo', titulo: 'Optimización y re-lanzamientos',
    desc: 'Si el primer lanzamiento no da los resultados buscados, vamos por un segundo, tercero y hasta cuarto. Puede pedirte más copys, revisiones o grabación — sin eso no se puede reajustar el marketing.', color: '#22C55E' },
];

function Nota({ icono, titulo, children, fecha }) {
  return (
    <div style={{ display: 'flex', gap: 12, background: T.azulWash2, border: `1px solid ${T.azulLinea}`, borderRadius: 14, padding: '13px 15px' }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>{icono}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 2 }}>{titulo}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: T.soft }}>{children}</div>
        {fecha && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, background: T.dark, color: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 700 }}>
            <IcoCalendar size={12} stroke="#fff" sw={2.2} /> Tu fecha elegida: {fecha}
          </div>
        )}
      </div>
    </div>
  );
}

// Intro por defecto (la de siempre) por si el panel no cargó una propia.
const INTRO = 'Armar tus dos embudos nos lleva entre 20 y 30 días hábiles de trabajo, '
  + 'sin contar las demoras de tu lado (subir material, revisar, grabarte). Este es el recorrido:';

export default function Roadmap({ grabacion, heading, config }) {
  // `config` llega del panel (app_settings.onboarding_config → clave roadmap). Si no
  // hay nada cargado, se usan los textos de siempre: el portal nunca queda en blanco.
  const fases = Array.isArray(config?.fases) && config.fases.length ? config.fases : FASES;
  const intro = String(config?.intro || '').trim() || INTRO;
  const notaGrab = String(config?.nota_grabacion || '').trim();
  const notaPlazos = String(config?.nota_plazos || '').trim();

  return (
    <div>
      <div style={{ ...kicker(T.faint, 11), marginBottom: 4 }}>El camino de tu proyecto</div>
      <h2 style={{ fontFamily: FUENTE.display, fontSize: 'clamp(21px,4.4vw,28px)', fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 8px 0' }}>
        {heading || config?.titulo || 'Cómo trabajamos, paso a paso'}
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: T.soft, margin: '0 0 22px 0' }}>{intro}</p>

      <div style={{ position: 'relative', marginBottom: 22 }}>
        {fases.map((f, i) => {
          const ultimo = i === fases.length - 1;
          return (
            <div key={f.n ?? i} style={{ display: 'flex', gap: 15 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', background: f.color || '#5B7CF5',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 14.5, boxShadow: `0 4px 12px ${(f.color || '#5B7CF5')}55`, zIndex: 1,
                }}>{f.n ?? i + 1}</div>
                {!ultimo && <div style={{ width: 2, flex: 1, minHeight: 26, background: T.line, margin: '2px 0' }} />}
              </div>
              <div style={{
                flex: 1, minWidth: 0, marginBottom: ultimo ? 0 : 14,
                background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14,
                padding: '14px 16px', borderLeft: `4px solid ${f.color || '#5B7CF5'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ ...kicker(f.color || '#5B7CF5', 10.5), letterSpacing: '.06em', fontWeight: 800 }}>{f.cuando}</span>
                  {f.tuParte && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: '#B45309', background: '#FEF3C7', borderRadius: 999, padding: '2px 7px' }}>Incluye tu grabación</span>
                  )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.015em', margin: '5px 0 3px' }}>{f.titulo}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: T.muted }}>{f.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Nota icono={<IcoClock size={17} stroke={T.azulTinta} sw={2.1} />} titulo="Cronómetro de grabación" fecha={grabacion}>
          {notaGrab || (<>
            Tienes <strong style={{ color: T.ink }}>10 días</strong> para grabarte desde que te entregamos todos los materiales
            creativos (guiones, VSL, estructura de la landing y copy).
          </>)}
        </Nota>
        <Nota icono={<IcoCalendar size={17} stroke={T.azulTinta} sw={2.1} />} titulo="Días hábiles y pausas">
          {notaPlazos || (<>
            Los plazos corren sobre <strong style={{ color: T.ink }}>días hábiles</strong> y se{' '}
            <strong style={{ color: T.ink }}>pausan solos</strong> cuando dependen de algo tuyo: grabación, material,
            accesos o aprobaciones pendientes.
          </>)}
        </Nota>
      </div>
    </div>
  );
}

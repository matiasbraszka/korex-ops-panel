import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import BottomNav from '../components/BottomNav';
import Avatar from '../components/Avatar';
import { ChipEmbudo } from './MaterialScreen';
import { Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { T, display, pill } from '../components/theme';
import { IcoComment, IcoMenu, IcoArrowR, IcoVideo, IcoPlaySoft, IcoClock, IcoChevR, IcoCheck } from '../components/icons';
import logo from '../assets/logo-korex.svg';

const WELCOME_KEY = 'korex_portal_guiones_bienvenida';

// Duración del bucle del demo de "cómo comentar". Todas las piezas usan ESTE
// valor: si se cambia acá, la historia entera sigue sincronizada.
const DEMO = '11s';

// Duración estimada de lectura (~2.4 palabras/seg) → "< 1 min" / "2:30 min".
const durLabel = (palabras) => {
  const seg = Math.round((palabras || 0) / 2.4);
  if (seg < 60) return '< 1 min';
  const m = Math.floor(seg / 60), s = Math.round((seg % 60) / 15) * 15 % 60;
  return `${m}:${String(s).padStart(2, '0')} min`;
};

// Tab GUIONES — bienvenida animada la primera vez; después, "Tus guiones": una
// tarjeta por guion (título, resumen, duración) que lleva al guion exacto dentro
// del documento. Los datos salen del DEL real.
//
// Están los de GRABAR (para_grabar) y los de REVISAR (accion "revisar" en el
// DEL, terminados). Antes solo se listaban los primeros: una pestaña puesta para
// revisar aparecía en la Home y adentro del documento, y justo en la pantalla
// que se llama Guiones no estaba.
// Una de grabar queda pendiente hasta que el EQUIPO la aprueba (g.grabado); haber
// subido el video (g.entregado) no alcanza — el equipo verifica que esté completa.
const pendiente = (g) => (g.tarea === 'revisar' ? !g.revisado : !g.grabado);
export default function GuionesTabScreen() {
  const nav = useNavigate();
  const { data: guiones, loading } = useAsync(() => api.guiones(), []);
  // La bienvenida se ve una sola vez. Con `?guia=1` se puede volver a ver cuando
  // se quiera — sirve para repasarla y para mostrársela a un cliente por encima
  // del hombro, sin tener que borrarle nada del teléfono.
  const [intro, setIntro] = useState(() => {
    try {
      if (new URLSearchParams(window.location.search).get('guia') === '1') return true;
      return !localStorage.getItem(WELCOME_KEY);
    } catch { return false; }
  });
  const [grabMap, setGrabMap] = useState({});

  // Responsable de cada guión (inicial de quien graba). Una sola llamada con los ids.
  useEffect(() => {
    const ids = (Array.isArray(guiones) ? guiones : []).map((g) => g.id);
    if (ids.length) api.grabInfo(ids).then((m) => setGrabMap(m || {}));
  }, [guiones]);

  if (loading) return <PhoneFrame><Loading label="Buscando tus guiones…" /></PhoneFrame>;
  const lista = Array.isArray(guiones) ? guiones : [];

  const cerrarIntro = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
      // Sacar el ?guia=1 de la barra, si no al recargar vuelve a abrirse.
      if (new URLSearchParams(window.location.search).get('guia') === '1') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch { /* */ }
    setIntro(false);
  };

  // ── LISTA "Tus guiones" — solo los PENDIENTES (revisar / grabar), agrupados por
  //    embudo, con el encargado a la vista. Los que ya están hechos no ensucian. ──
  if (!intro) {
    const pendientes = lista.filter(pendiente);
    const hechos = lista.length - pendientes.length;
    const porRevisar = pendientes.filter((g) => g.tarea === 'revisar').length;
    const porGrabar = pendientes.length - porRevisar;

    // Agrupar por funnel (orden por número de funnel).
    const grupos = {};
    pendientes.forEach((g) => {
      const info = grabMap[g.id] || {};
      const key = g.strategyId || 'sin';
      if (!grupos[key]) grupos[key] = { key, funnel: info.funnel || g.funnel, num: info.funnelNum ?? null, items: [] };
      grupos[key].items.push(g);
    });
    const gruposArr = Object.values(grupos).sort((a, b) => (a.num ?? 99) - (b.num ?? 99));

    return (
      <PhoneFrame>
        <KxScreen>
          <div className="kxs" style={{ flex: 1, overflowY: 'auto' }}>
            {isDemo() && <div style={{ padding: '12px 22px 0' }}><DemoBanner /></div>}
            <div style={{ padding: '22px 22px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={display(30, '-0.035em')}>Tus guiones</div>
              <div style={{ fontSize: 15, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>
                {pendientes.length === 0 ? '¡Estás al día! No tienes guiones pendientes.'
                  : 'Esto es lo que te falta grabar o revisar. Cada uno con su embudo y quién lo graba.'}
              </div>
              {pendientes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 2 }}>
                  {porGrabar > 0 && (
                    <span style={{ ...pill('var(--mk-green-bg)', 'var(--mk-green)'), gap: 6 }}>
                      <IcoVideo size={12} stroke="var(--mk-green)" sw={2.2} />
                      {porGrabar === 1 ? '1 para grabar' : `${porGrabar} para grabar`}
                    </span>
                  )}
                  {porRevisar > 0 && (
                    <span style={{ ...pill('var(--mk-blue-bg)', 'var(--mk-blue-ops)'), gap: 6 }}>
                      {porRevisar === 1 ? '1 para revisar' : `${porRevisar} para revisar`}
                    </span>
                  )}
                </div>
              )}
            </div>

            {pendientes.length === 0 && (
              <div style={{ margin: '24px 22px 0', background: '#fff', borderRadius: 20, padding: 26, textAlign: 'center', color: T.text2, fontSize: 14.5, lineHeight: 1.5, boxShadow: 'var(--shadow-md)' }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
                {hechos > 0
                  ? <>Ya tienes <b>{hechos}</b> {hechos === 1 ? 'guion resuelto' : 'guiones resueltos'}. No queda nada pendiente.</>
                  : <>Todavía no hay guiones para ti.<br />Cuando el equipo los prepare, aparecen aquí.</>}
              </div>
            )}

            {/* Grupos por embudo */}
            {gruposArr.map((grp) => (
              <div key={grp.key} style={{ padding: '22px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <ChipEmbudo nombre={grp.funnel} num={grp.num} general={!grp.funnel} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text3 }}>
                    {grp.items.length} {grp.items.length === 1 ? 'guion' : 'guiones'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {grp.items.map((g) => <GuionCard key={g.id} g={g} nav={nav} resp={grabMap[g.id]?.responsable} />)}
                </div>
              </div>
            ))}

            {pendientes.length > 0 && hechos > 0 && (
              <div style={{ padding: '20px 22px 4px', fontSize: 12.5, color: T.text3, textAlign: 'center' }}>
                Ya tienes {hechos} {hechos === 1 ? 'guion resuelto' : 'guiones resueltos'} (no los mostramos para no estorbar).
              </div>
            )}
            <div style={{ height: 22 }} />
          </div>
          <BottomNav activeOverride="/guiones" />
        </KxScreen>
      </PhoneFrame>
    );
  }

  // ── BIENVENIDA (exacta al prototipo, con los demos animados) ──
  return (
    <PhoneFrame>
      <div className="kxs" data-kx-plain="" style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box', background: 'linear-gradient(180deg, var(--mk-blue-bg2) 0%, var(--mk-bg-panel) 34%)', padding: '44px 20px 30px', animation: 'kxFade .25s ease' }}>
        <img src={logo} alt="Método Korex" style={{ height: 26, width: 'auto', display: 'block', marginBottom: 20 }} />
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: T.ink, lineHeight: 1.15, marginBottom: 10 }}>
          Aquí viven tus guiones,<br />listos para leer, revisar y grabar.
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.55, color: T.textSoft, marginBottom: 24 }}>Tres cosas y ya eres autónomo:</div>

        {/* 1 · Encuentra cualquier guion (drawer animado con kxSlide + kxRing) */}
        <div style={introCard}>
          <div style={introHead}>
            <span style={introNum}>1</span>
            <div style={introTitle}>Encuentra cualquier guion</div>
          </div>
          <div style={{ position: 'relative', background: 'var(--mk-bg-panel)', border: '1px solid #EEF0F4', borderRadius: 14, overflow: 'hidden', height: 150 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', background: '#fff', borderBottom: '1px solid var(--mk-border)' }}>
              <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
                <span style={{ position: 'absolute', inset: -5, border: '2px solid var(--mk-blue-ops)', borderRadius: 999, animation: 'kxRing 1.9s ease-out infinite' }} />
                <div style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--mk-border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IcoMenu size={17} stroke="var(--mk-blue-ops)" sw={2.2} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: T.primary }}>ADS</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, whiteSpace: 'nowrap' }}>Ads avatar 1</div>
              </div>
            </div>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '80%', background: '#fff', boxShadow: '6px 0 26px rgba(10,22,40,.14)', padding: '12px 8px', boxSizing: 'border-box', animation: 'kxSlide 4.4s ease-in-out infinite' }}>
              <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: T.text3, padding: '0 8px 7px' }}>GUIONES DE ESTE EMBUDO</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, background: 'var(--mk-blue-bg)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--mk-blue-ops)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.primaryInk }}>Ads avatar 1</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--mk-green)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.text }}>VSL Avatar 1</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--mk-orange)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.text }}>Avatar 1 — Emprend…</span>
              </div>
            </div>
          </div>
          <div style={introCaption}>Toca las <b style={{ color: T.textSoft }}>tres rayitas</b> arriba a la izquierda y elige el guion que quieras.</div>
        </div>

        {/* 2 · Comenta. El demo imita la pantalla real: la barra de arriba con su
            botón, y abajo el texto marcándose. Los tres tiempos del bucle son el
            gesto de verdad: mantener pulsado marca una palabra, los tiradores la
            estiran, y recién ahí se enciende el botón de arriba. */}
        <div style={introCard}>
          <div style={introHead}>
            <span style={introNum}>2</span>
            <div style={introTitle}>Comenta lo que quieras cambiar</div>
          </div>
          <div className="kx-demo-comentar" style={{ position: 'relative', background: 'var(--mk-bg-panel)', border: '1px solid #EEF0F4', borderRadius: 14, overflow: 'hidden' }}>
            {/* Barra de arriba, igual que en el documento real */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: '#fff', borderBottom: '1px solid var(--mk-border)' }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: T.surface2, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: T.primary }}>ADS</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.ink, whiteSpace: 'nowrap' }}>Ads avatar 1</div>
              </div>
              {/* El botón: apagado hasta que hay algo marcado, y el toque encima.
                  Al final el contador sube de 2 a 3 — los dos números están
                  superpuestos para que el botón no cambie de ancho. */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <span className="kx-boton" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '6px 11px', borderRadius: 999, border: '1px solid var(--mk-border)', background: '#fff', color: T.text3, animation: `kxBotonOn ${DEMO} ease-in-out infinite` }}>
                  <IcoComment size={13} stroke="currentColor" sw={2.2} />
                  <span style={{ position: 'relative', display: 'inline-block', width: 7, textAlign: 'center' }}>
                    <span className="kx-num-viejo" style={{ animation: `kxNumViejo ${DEMO} ease-in-out infinite` }}>2</span>
                    <span className="kx-num-nuevo" style={{ position: 'absolute', left: 0, right: 0, opacity: 0, animation: `kxNumNuevo ${DEMO} ease-in-out infinite` }}>3</span>
                  </span>
                </span>
                <span style={{ position: 'absolute', inset: -4, border: '2px solid var(--mk-blue-ops)', borderRadius: 999, animation: `kxDedo ${DEMO} ease-in-out infinite`, pointerEvents: 'none' }} />
              </div>
            </div>

            {/* El texto, con la marca que se estira y termina en amarillo */}
            <div style={{ padding: '14px 15px 92px', fontSize: 13, lineHeight: 1.78, color: T.text3, fontWeight: 500 }}>
              Si estás cansado de{' '}
              <span className="kx-marca" style={{ position: 'relative', display: 'inline-block', backgroundImage: 'linear-gradient(rgba(91,124,245,.30),rgba(91,124,245,.30))', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', backgroundSize: '0% 82%', borderRadius: 3, color: T.textSoft, fontWeight: 600, animation: `kxMarca ${DEMO} ease-in-out infinite` }}>
                perseguir a amigos y familiares
                {/* Los dos tiradores del teléfono: el de la izquierda queda fijo,
                    el de la derecha viaja mientras la marca crece. Los dos se van
                    cuando el comentario ya quedó guardado. */}
                <span className="kx-tirador-izq" style={{ position: 'absolute', left: 0, top: -3, bottom: -3, width: 2, background: 'var(--mk-blue-ink)', animation: `kxTiradorIzq ${DEMO} ease-in-out infinite`, pointerEvents: 'none' }}>
                  <span style={{ position: 'absolute', left: -4, top: -5, width: 10, height: 10, borderRadius: 999, background: 'var(--mk-blue-ink)' }} />
                </span>
                <span className="kx-tirador-der" style={{ position: 'absolute', left: 0, top: -3, bottom: -3, width: 2, background: 'var(--mk-blue-ink)', animation: `kxTirador ${DEMO} ease-in-out infinite`, pointerEvents: 'none' }}>
                  <span style={{ position: 'absolute', left: -4, bottom: -5, width: 10, height: 10, borderRadius: 999, background: 'var(--mk-blue-ink)' }} />
                </span>
              </span>{' '}
              para que se sumen a tu negocio, quédate 30 segundos.
            </div>

            {/* La caja: sube, se escribe la nota sola y se envía. */}
            <div className="kx-caja" style={{ position: 'absolute', left: 10, right: 10, bottom: 10, background: '#fff', border: '1px solid var(--mk-border)', borderRadius: 12, padding: 9, boxShadow: '0 -6px 20px rgba(10,22,40,.12)', animation: `kxCaja ${DEMO} ease-in-out infinite` }}>
              <div style={{ fontSize: 9.5, color: '#8A6D2B', borderLeft: '2px solid var(--mk-yellow)', paddingLeft: 6, marginBottom: 6, fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                “perseguir a amigos y familiares”
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--mk-border)', borderRadius: 8, padding: '5px 7px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11, color: T.text, animation: `kxEscribe ${DEMO} steps(19, end) infinite` }}>
                    Esto no lo digo así
                  </span>
                  <span style={{ width: 1.5, height: 12, background: 'var(--mk-blue-ops)', marginLeft: 1, animation: `kxCursor ${DEMO} steps(1, end) infinite` }} />
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--mk-blue-ops)', color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '6px 10px', borderRadius: 999, flexShrink: 0 }}>
                  <IcoComment size={11} stroke="currentColor" sw={2.4} />
                  Enviar
                </span>
              </div>
            </div>

            {/* El final feliz: quedó guardado. */}
            <div className="kx-ok" style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', opacity: 0, animation: `kxOk ${DEMO} ease-in-out infinite`, pointerEvents: 'none' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--mk-green-bg)', color: 'var(--mk-green)', border: '1px solid color-mix(in srgb, var(--mk-green) 28%, transparent)', fontSize: 11, fontWeight: 800, padding: '6px 12px', borderRadius: 999 }}>
                <IcoCheck size={12} stroke="currentColor" sw={2.6} />
                Comentario enviado
              </span>
            </div>
          </div>
          <div style={introCaption}>
            <b style={{ color: T.textSoft }}>Mantén el dedo</b> sobre una palabra y estira con las bolitas hasta donde
            quieras. Toca el <b style={{ color: T.textSoft }}>botón de arriba</b>, que se pone azul, escribe tu nota y
            envíala. La frase queda <b style={{ color: '#8A6D2B' }}>marcada en amarillo</b>: el equipo ya la tiene.
          </div>
        </div>

        {/* 3 · Graba y sube todo junto */}
        <div style={{ ...introCard, marginBottom: 22 }}>
          <div style={introHead}>
            <span style={introNum}>3</span>
            <div style={introTitle}>Graba y sube todo junto</div>
          </div>
          <div style={{ background: 'var(--mk-bg-panel)', border: '1px solid #EEF0F4', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--mk-blue-ops)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: T.textSoft }}><b>Ads:</b> todos los anuncios están en una sola pestaña</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--mk-green)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: T.textSoft }}><b>VSL:</b> el video largo va en su propia pestaña</span>
            </div>
            <div style={{ height: 1, background: 'var(--mk-border)' }} />
            <div style={{ fontSize: 13, lineHeight: 1.5, color: T.text2 }}>Al final de cada pestaña hay un botón para subir tus videos, todos de una vez.</div>
          </div>
        </div>

        <div onClick={cerrarIntro} role="button" style={{ cursor: 'pointer', width: '100%', boxSizing: 'border-box', background: 'var(--mk-blue-ops)', color: '#fff', fontSize: 16, fontWeight: 700, padding: 16, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 24px rgba(91,124,245,.36)' }}>
          Ver mis guiones
          <IcoArrowR size={18} stroke="currentColor" sw={2.4} />
        </div>
        <div style={{ fontSize: 12, color: T.text3, textAlign: 'center', marginTop: 14 }}>No te lo mostramos de nuevo</div>
      </div>
    </PhoneFrame>
  );
}

const introCard = { background: '#fff', border: '1px solid var(--mk-border)', borderRadius: 18, padding: 18, marginBottom: 12, boxShadow: 'var(--shadow-md)' };
const introHead = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 };
const introNum = { width: 26, height: 26, borderRadius: 999, background: 'var(--mk-blue-ops)', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const introTitle = { fontSize: 16, fontWeight: 800, color: 'var(--mk-ink)' };
const introCaption = { fontSize: 13, lineHeight: 1.5, color: 'var(--mk-text2)', margin: '12px 2px 0' };

// Tarjeta de un guion: qué es, cuánto dura y ABRIR GUIÓN (va al guion exacto).
function GuionCard({ g, nav, hecho = false, resp = null }) {
  const esVsl = g.docTipo === 'vsl';
  const esRevisar = g.tarea === 'revisar';
  const abrir = () => nav(`/documento/${g.strategyId}/${g.docTipo}`, { state: { secId: g.id } });
  return (
    <div onClick={abrir} role="button" style={{ cursor: 'pointer', background: '#fff', borderRadius: 20, padding: 18, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 12, opacity: hecho ? 0.72 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ width: 42, height: 42, flex: 'none', borderRadius: 13, background: esVsl ? 'var(--mk-green-bg)' : 'var(--mk-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {esVsl
            ? <IcoPlaySoft size={20} stroke="var(--mk-green)" sw={2} />
            : <IcoVideo size={20} stroke="var(--mk-blue-ops)" sw={1.9} />}
        </div>
        {esRevisar
          ? (
            <span style={pill(g.revisado ? 'var(--mk-green-bg)' : 'var(--mk-blue-bg)', g.revisado ? 'var(--mk-green)' : 'var(--mk-blue-ops)')}>
              {g.revisado ? 'Revisado' : 'Para revisar'}
            </span>
          )
          : g.grabado
            ? (
              <span style={pill('var(--mk-green-bg)', 'var(--mk-green)')}>Grabado</span>
            )
            : g.entregado
              ? (
                <span style={pill('var(--mk-blue-bg)', 'var(--mk-blue-ops)')}>Enviado · validando</span>
              )
              : (
                <span style={pill('var(--mk-orange-bg)', 'var(--mk-orange)')}>Para grabar</span>
              )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.18, color: T.ink, textWrap: 'balance' }}>{g.titulo}</div>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.text3 }}>{esVsl ? 'VSL' : 'Guion de anuncios'}{esRevisar ? ' · Solo leer' : ''}</div>
        {g.snippet && (
          <div style={{ fontSize: 13, lineHeight: 1.5, color: T.text2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {g.snippet}{g.snippet.length >= 160 ? '…' : ''}
          </div>
        )}
      </div>
      {resp && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -2 }}>
          <Avatar resp={resp} size={24} />
          <span style={{ fontSize: 12, color: T.text2 }}>
            <span style={{ color: T.text3 }}>Graba: </span><b style={{ color: T.textSoft }}>{resp.nombre}</b>
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #EEF0F4' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: T.textSoft }}>
          <IcoClock size={13} stroke="currentColor" sw={2.2} />
          {durLabel(g.palabras)}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.primary }}>
          {esRevisar ? 'Leer y revisar' : 'Abrir guion'}
          <IcoChevR size={13} stroke="var(--mk-blue-ops)" sw={2.6} />
        </span>
      </div>
    </div>
  );
}

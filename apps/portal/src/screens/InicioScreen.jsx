import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { destinoTarea } from '../data/taskNav';
import { PerfilSheet, AccesosSheet, GuiasSheet, ReglasServicioSheet } from '../components/Layout';
import { T, display, microLabel } from '../components/theme';
import { IcoVideo, IcoImage, IcoKey, IcoClock, IcoInfo, IcoCheck, IcoChevR, IcoFile, IcoDoc } from '../components/icons';
import logo from '../assets/logo-korex.svg';

// INICIO — exacta al prototipo: logo + iniciales, "Hola, Sergio", Avance,
// LO QUE TE FALTA como tarjetas grandes accionables y lo entregado en verde.
export default function InicioScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.inicio(), []);
  const { data: tareasData } = useAsync(() => api.tareas(), []);
  const { data: me } = useAsync(() => api.me(), []);
  const [perfil, setPerfil] = useState(false);
  const [acc, setAcc] = useState(false);
  const [tut, setTut] = useState(false);
  const [reg, setReg] = useState(false);

  if (loading) return <Loading label="Cargando tu proyecto…" />;
  const d = data || {};
  const clientName = me?.name || me?.clientName || d.name;
  const iniciales = String(clientName || '·').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const nombre = String(d.name || '').split(' ')[0];
  const pendientes = Array.isArray(d.pendientes) ? d.pendientes : [];
  const tareas = (Array.isArray(tareasData) ? tareasData : []).map((t) => ({ ...t, _tarea: true }));
  const completados = Array.isArray(d.completados) ? d.completados : [];
  const total = pendientes.length + tareas.length;
  const wa = (d.whatsapp || '').replace(/\D/g, '');

  // Onboarding sin terminar: es lo único que importa hasta que lo cierre.
  const onb = d.onboarding || {};
  const onbPendiente = !!onb.existe && !onb.completo;

  // El texto tiene que corresponderse con el número de la barra: decir "te
  // falta poco" con un 5% hace que el cliente deje de creerle a la pantalla.
  const intro = onbPendiente
    ? (onb.pct >= 70 ? 'Te falta poco para que empecemos. Sigue donde quedaste.'
      : onb.pct > 0 ? 'Vas bien. Sigue donde quedaste, se guardó todo.'
      : 'Antes de empezar necesitamos que nos cuentes sobre tu negocio.')
    : total === 0
      ? 'Nos entregaste todo lo que necesitábamos. Ahora seguimos nosotros.'
      : `Necesitamos ${total === 1 ? '1 cosa tuya' : `${total} cosas tuyas`} para seguir avanzando. Empieza por la primera.`;
  const avanceNota = total === 0
    ? 'Ya entregaste todo. De aquí en adelante avanzamos nosotros.'
    : 'Este número sube cuando subes el material que falta. Sin eso no podemos seguir.';

  return (
    <>
      {isDemo() && <div style={{ padding: '12px 22px 0' }}><DemoBanner /></div>}

      {/* Logo + perfil (iniciales) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 0' }}>
        <img src={logo} alt="Método Korex" style={{ height: 26, width: 'auto' }} />
        <div onClick={() => setPerfil(true)} role="button" aria-label="Tu perfil" style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: T.text2 }}>{iniciales}</div>
      </div>

      {/* Hola */}
      <div style={{ padding: '22px 22px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={display(30, '-0.035em')}>Hola{nombre ? `, ${nombre}` : ''}</div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>{intro}</div>
      </div>

      {/* Onboarding sin terminar: reemplaza TODO el bloque de pendientes por una
          sola tarjeta grande. Mientras no lo complete, no hay nada más que
          hacer en la plataforma — mostrarle pendientes de material mezclados
          con el onboarding lo dispersa y lo hace tardar más. */}
      {onbPendiente ? (
        <div style={{ padding: '22px 22px 0' }}>
          <div
            onClick={() => nav('/onboarding')} role="button"
            style={{ cursor: 'pointer', background: '#fff', borderRadius: 22, padding: 22, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 11px', borderRadius: 999, background: 'var(--mk-blue-bg)', color: 'var(--mk-blue-ink)' }}>
                Te toca a ti
              </span>
            </div>

            <div style={{ display: 'flex', gap: 15, alignItems: 'flex-start' }}>
              <span style={{ width: 46, height: 46, borderRadius: 15, background: 'var(--mk-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <IcoDoc size={21} stroke="#1D4ED8" />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.16, color: T.ink }}>
                  {onb.pct > 0 ? 'Sigue con tu onboarding' : 'Completa tu onboarding'}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.5, color: '#252B36', marginTop: 7 }}>
                  {onb.agendaEstado === 'pendiente'
                    ? 'Primero reserva el día de tu sesión, y después cuéntanos sobre tu negocio.'
                    : 'Es de donde sacamos tu estrategia, tus anuncios y tu video de ventas.'}
                </div>
              </div>
            </div>

            <div>
              <div style={{ height: 9, borderRadius: 999, background: '#EDF0F4', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: 'var(--mk-blue-dark)', transition: 'width .35s ease', width: `${onb.pct || 0}%` }} />
              </div>
              {/* Solo el porcentaje. Arrancar viendo "0 de 49 respuestas" es un
                  número que asusta y no ayuda a decidir nada; el detalle está
                  adentro, tramo por tramo. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: '#525A6B', marginTop: 8 }}>
                <span>{onb.pct || 0}% completo</span>
                {onb.desbloqueadas > 0 && <span>{onb.desbloqueadas} {onb.desbloqueadas === 1 ? 'tramo listo' : 'tramos listos'}</span>}
              </div>
            </div>

            <div style={{ height: 54, borderRadius: 999, background: 'var(--mk-blue-dark)', color: '#fff', fontSize: 13.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {onb.pct > 0 ? 'Seguir donde quedé' : 'Empezar'}
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Avance de tu proyecto */}
      <div style={{ margin: '20px 22px 0', padding: '18px 20px', background: '#fff', borderRadius: 20, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.textSoft }}>Avance de tu proyecto</span>
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 17, fontWeight: 800, color: T.primary }}>{d.progreso ?? 0}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: T.surface2, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: T.primary, transition: 'width .35s ease', width: `${Math.min(100, d.progreso ?? 0)}%` }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <IcoInfo size={15} stroke="var(--mk-text3)" sw={2.1} style={{ flex: 'none', marginTop: 2 }} />
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: T.text2, flex: 1 }}>{d.todosTerminados ? 'Embudos todos al aire. Ahora, optimizando los resultados.' : avanceNota}</span>
        </div>
      </div>

      {/* LO QUE TE FALTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '30px 22px 14px' }}>
        <div style={display(22, '-0.03em')}>Lo que te falta</div>
        {total > 0 && <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 24, padding: '0 8px', borderRadius: 999, background: 'var(--mk-red-bg)', color: 'var(--mk-red)', fontSize: 12.5, fontWeight: 700 }}>{total}</div>}
      </div>

      <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pendientes.map((p, i) => <PendienteCard key={p.id || (p.tipo || '') + i} p={p} nav={nav} />)}
        {tareas.map((t) => <TareaCard key={t.id} t={t} nav={nav} />)}

        {total === 0 && (
          <div style={{ background: '#fff', borderRadius: 22, padding: '26px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-md)', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--mk-green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IcoCheck size={26} stroke="var(--mk-green)" sw={2.6} />
            </div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em', color: T.ink }}>Estás al día</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: T.text2 }}>Nos entregaste todo. Seguimos nosotros: editamos tus videos y publicamos. Te avisamos aquí.</div>
          </div>
        )}

        {/* Lo ya entregado */}
        {completados.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 2 }}>
            {completados.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 17px', borderRadius: 16, background: 'var(--mk-green-bg)' }}>
                <IcoCheck size={17} stroke="var(--mk-green)" sw={2.5} />
                <span style={{ fontSize: 13, fontWeight: 600, color: T.textSoft }}>Ya entregaste: {c.titulo}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {/* Lo que pide el cliente no es lo único que podemos usar: si tiene más
          fotos o videos, la puerta está abierta y conviene decirlo. PERO no
          mientras está completando el onboarding: ahí lo único que tiene que
          hacer es terminarlo, y este cartel lo dispersa hacia Material. */}
      {!onbPendiente && (
      <div onClick={() => nav('/material')} role="button"
        style={{ margin: '22px 22px 0', padding: '16px 18px', borderRadius: 18, background: 'var(--mk-blue-bg)', border: '1px solid var(--mk-blue-border, #DDE5FB)', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IcoImage size={19} stroke="var(--mk-blue-ops)" sw={2.1} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, lineHeight: 1.3 }}>
            ¿Tienes más contenido para darnos?
          </div>
          <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.45, marginTop: 2 }}>
            Imágenes, videos, lo que sea. Entra en <b>Material</b> y súbelo a la carpeta que corresponda.
          </div>
        </div>
        <IcoChevR size={17} stroke={T.text3} sw={2.2} />
      </div>
      )}

      <div style={{ padding: '26px 22px 20px', fontSize: 12.5, lineHeight: 1.5, color: T.text3, textAlign: 'center' }}>
        ¿Algo no se entiende?{' '}
        {wa
          ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Escríbenos por WhatsApp.</a>
          : <b style={{ color: T.text2 }}>Escríbenos por WhatsApp.</b>}
      </div>

      {perfil && <PerfilSheet clientName={clientName} onClose={() => setPerfil(false)} onAccesos={() => { setPerfil(false); setAcc(true); }} onGuias={() => { setPerfil(false); setTut(true); }} onReglas={() => { setPerfil(false); setReg(true); }} />}
      {acc && <AccesosSheet onClose={() => setAcc(false)} />}
      {tut && <GuiasSheet onClose={() => setTut(false)} />}
      {reg && <ReglasServicioSheet onClose={() => setReg(false)} />}
    </>
  );
}

// ── Tarjeta UNIFORME de pendiente (misma estructura para todas, mobile-first):
//    chip de estado + "hace N días" · icono + título + descripción · botón azul
//    grande IGUAL en todas. El cliente nunca tiene que adivinar dónde tocar.
function CardBase({ onClick, tile, chip, dias, titulo, descripcion, cta, caption }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', background: '#fff', borderRadius: 22, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--shadow-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {chip}
        {dias != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: T.text3 }}>
            <IcoClock size={12} stroke="currentColor" sw={2.3} />
            {dias === 0 ? 'Pedido hoy' : dias === 1 ? 'Hace 1 día' : `Hace ${dias} días`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 15, alignItems: 'flex-start' }}>
        {tile}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.16, color: T.ink, textWrap: 'balance' }}>{titulo}</div>
          {descripcion && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>{descripcion}</div>}
        </div>
      </div>
      <div style={{ height: 48, borderRadius: 999, background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {cta}
        <IcoChevR size={16} stroke="#fff" sw={2.4} />
      </div>
      {caption}
    </div>
  );
}

const tileStyle = (bg) => ({ width: 46, height: 46, flex: 'none', borderRadius: 15, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' });
const chipEstado = (bg, ink, texto) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, background: bg, color: ink }}>{texto}</span>
);

function PendienteCard({ p, nav }) {
  const esGrab = String(p.tipo || '').startsWith('grabacion');
  const esMeta = p.tipo === 'acceso_meta';
  // Lo que le toca LEER (accion "revisar" en el DEL). Va derecho al documento:
  // acá no hay nada que elegir, es un texto y un botón.
  const esRev = p.tipo === 'revision';
  const validando = p.estado === 'cliente_dice_listo';
  const enProceso = !esGrab && !esMeta && !esRev && p.target != null && (p.subidos ?? 0) > 0;

  const abrir = () => {
    if (esGrab) nav('/guiones');                 // a ELEGIR el guion, no a un documento de una
    else if (esRev) nav(`/documento/${p.strategyId}/${p.docTipo}`);
    else if (esMeta) nav('/meta');
    else nav(`/pedido/${p.id}`, { state: { pedido: p } });
  };
  const chip = esRev ? chipEstado('var(--mk-blue-bg)', 'var(--mk-blue-ops)', p.pendientes > 1 ? `Para revisar · ${p.pendientes}` : 'Para revisar')
    : validando ? chipEstado('var(--mk-blue-bg)', 'var(--mk-blue-ops)', 'En revisión')
    : enProceso ? chipEstado('var(--mk-orange-bg)', 'var(--mk-orange)', `En proceso · ${p.subidos} de ${p.target}`)
    : chipEstado('var(--mk-red-bg)', 'var(--mk-red)', 'Pendiente');
  const tile = esGrab ? <div style={tileStyle('var(--mk-blue-bg)')}><IcoVideo size={22} stroke="var(--mk-blue-ops)" sw={1.9} /></div>
    : esRev ? <div style={tileStyle('var(--mk-blue-bg)')}><IcoDoc size={22} stroke="var(--mk-blue-ops)" sw={1.9} /></div>
    : esMeta ? <div style={tileStyle('var(--mk-red-bg)')}><IcoKey size={22} stroke="var(--mk-red)" sw={1.9} /></div>
    : <div style={tileStyle('var(--mk-blue-bg)')}><IcoImage size={22} stroke="var(--mk-blue-ops)" sw={1.9} /></div>;
  const cta = esGrab ? 'Ver mis guiones'
    : esRev ? 'Leerlo ahora'
    : esMeta ? (validando ? 'Ver el paso a paso' : 'Conectar mi Meta')
    : p.tipo === 'fotos' ? 'Subir fotos' : 'Subir material';
  const caption = esRev ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: T.text3, textAlign: 'center' }}>
      <IcoFile size={13} stroke="var(--mk-text3)" sw={2} />
      Al final tocas «Marcar como revisado»
    </div>
  ) : esGrab ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: T.text3 }}>
      <IcoFile size={13} stroke="var(--mk-text3)" sw={2} />
      Te lleva a elegir cuál grabar
    </div>
  ) : esMeta && p.bloqueante && !validando ? (
    <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--mk-red)' }}>Nos está frenando</div>
  ) : null;

  return <CardBase onClick={abrir} tile={tile} chip={chip} dias={p.dias} titulo={p.titulo} descripcion={p.descripcion} cta={cta} caption={caption} />;
}

// Tarea del sistema de operaciones asignada al cliente (misma tarjeta uniforme).
function TareaCard({ t, nav }) {
  const dest = destinoTarea(t);
  if (!dest) return null;
  return (
    <CardBase
      onClick={() => nav(dest.to, { state: dest.state })}
      tile={<div style={tileStyle('var(--mk-orange-bg)')}><IcoFile size={22} stroke="var(--mk-orange)" sw={1.9} /></div>}
      chip={chipEstado('var(--mk-red-bg)', 'var(--mk-red)', 'Pendiente')}
      dias={t.dias}
      titulo={t.titulo}
      descripcion={t.funnel ? `Embudo ${t.funnel}` : null}
      cta={dest.cta}
    />
  );
}

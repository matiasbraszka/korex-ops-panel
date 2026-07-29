import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { destinoTarea } from '../data/taskNav';
import { PerfilSheet, AccesosSheet, TutorialesSheet } from '../components/Layout';
import { T, display, microLabel } from '../components/theme';
import { IcoVideo, IcoImage, IcoKey, IcoClock, IcoInfo, IcoCheck, IcoChevR, IcoFile } from '../components/icons';
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
  const intro = total === 0
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

      <div style={{ padding: '26px 22px 20px', fontSize: 12.5, lineHeight: 1.5, color: T.text3, textAlign: 'center' }}>
        ¿Algo no se entiende?{' '}
        {wa
          ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Escríbenos por WhatsApp.</a>
          : <b style={{ color: T.text2 }}>Escríbenos por WhatsApp.</b>}
      </div>

      {perfil && <PerfilSheet clientName={clientName} onClose={() => setPerfil(false)} onAccesos={() => { setPerfil(false); setAcc(true); }} onTutoriales={() => { setPerfil(false); setTut(true); }} />}
      {acc && <AccesosSheet onClose={() => setAcc(false)} />}
      {tut && <TutorialesSheet onClose={() => setTut(false)} />}
    </>
  );
}

// Tarjeta de un pedido, con el diseño EXACTO del prototipo según su tipo.
function PendienteCard({ p, nav }) {
  const esGrab = String(p.tipo || '').startsWith('grabacion');
  const esMeta = p.tipo === 'acceso_meta';
  const validando = p.estado === 'cliente_dice_listo';
  const abrir = () => {
    if (esGrab) nav(`/documento/${p.strategyId}/${p.docTipo || 'ads'}`);
    else if (esMeta) nav('/meta');
    else nav(`/pedido/${p.id}`, { state: { pedido: p } });
  };
  const pedidoHace = p.dias == null ? null : p.dias === 0 ? 'Te lo pedimos hoy' : p.dias === 1 ? 'Te lo pedimos hace 1 día' : `Te lo pedimos hace ${p.dias} días`;
  const Icon = esGrab ? IcoVideo : esMeta ? IcoKey : IcoImage;

  return (
    <div onClick={abrir} style={{ cursor: 'pointer', background: '#fff', borderRadius: 22, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-md)' }}>
      <div style={{ display: 'flex', gap: 15, alignItems: 'flex-start' }}>
        <div style={{ width: 46, height: 46, flex: 'none', borderRadius: 15, background: esMeta ? 'var(--mk-red-bg)' : 'var(--mk-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} stroke={esMeta ? 'var(--mk-red)' : 'var(--mk-blue-ops)'} sw={1.9} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.14, color: T.ink, textWrap: 'balance' }}>{p.titulo}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>{p.descripcion}</div>
        </div>
      </div>
      {pedidoHace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--mk-orange)' }}>
          <IcoClock size={13} stroke="var(--mk-orange)" sw={2.3} />
          {pedidoHace}
        </div>
      )}
      {esGrab ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ height: 48, borderRadius: 999, background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            Abrir mis guiones
            <IcoChevR size={16} stroke="#fff" sw={2.4} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: T.text3 }}>
            <IcoFile size={14} stroke="var(--mk-text3)" sw={2} />
            Te lleva al documento, sección {p.docTipo === 'vsl' ? 'VSL' : 'Ads'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', height: 46, padding: '0 22px', borderRadius: 999, background: esMeta ? T.primary : T.ink, color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {esMeta ? (validando ? 'Ver el paso a paso' : 'Cómo se hace') : p.tipo === 'fotos' ? 'Subir fotos' : 'Subir material'}
          </div>
          {esMeta
            ? <span style={{ fontSize: 12.5, fontWeight: 600, color: validando ? 'var(--mk-green)' : 'var(--mk-red)' }}>{validando ? 'Lo estamos validando' : p.bloqueante ? 'Nos está frenando' : ''}</span>
            : p.target != null && <span style={{ fontSize: 12.5, color: T.text3 }}>{p.subidos ?? 0} de {p.target} subidas</span>}
        </div>
      )}
    </div>
  );
}

// Tarea del sistema de operaciones asignada al cliente (mismo look de tarjeta).
function TareaCard({ t, nav }) {
  const dest = destinoTarea(t);
  const pedidoHace = t.dias == null ? null : t.dias === 0 ? 'Te lo pedimos hoy' : t.dias === 1 ? 'Te lo pedimos hace 1 día' : `Te lo pedimos hace ${t.dias} días`;
  return (
    <div onClick={() => dest && nav(dest.to, { state: dest.state })} style={{ cursor: dest ? 'pointer' : 'default', background: '#fff', borderRadius: 22, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-md)' }}>
      <div style={{ display: 'flex', gap: 15, alignItems: 'flex-start' }}>
        <div style={{ width: 46, height: 46, flex: 'none', borderRadius: 15, background: 'var(--mk-orange-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IcoFile size={22} stroke="var(--mk-orange)" sw={1.9} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.14, color: T.ink, textWrap: 'balance' }}>{t.titulo}</div>
          {t.funnel && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: T.text2 }}>Embudo {t.funnel}</div>}
        </div>
      </div>
      {pedidoHace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--mk-orange)' }}>
          <IcoClock size={13} stroke="var(--mk-orange)" sw={2.3} />
          {pedidoHace}
        </div>
      )}
      {dest && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 22px', borderRadius: 999, background: T.ink, color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {dest.cta}
            <IcoChevR size={14} stroke="#fff" sw={2.4} />
          </div>
        </div>
      )}
    </div>
  );
}

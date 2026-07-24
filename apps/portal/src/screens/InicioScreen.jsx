import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Video, Camera, KeyRound, CheckCircle2, PlusCircle, ClipboardList, PartyPopper } from 'lucide-react';
import { Screen, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { destinoTarea } from '../data/taskNav';
import { T, cardStyle, microLabel, bigBtn } from '../components/theme';

// INICIO (diseño nuevo): "Hola, Sergio" + avance + LO QUE TE FALTA como tarjetas
// accionables. Cada tarjeta lleva al lugar exacto: documento de guiones, subir
// material o el paso a paso de Meta. Las tareas del sistema de operaciones
// asignadas al cliente también entran acá.
export default function InicioScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.inicio(), []);
  const { data: tareasData } = useAsync(() => api.tareas(), []);

  if (loading) return <Loading label="Cargando tu proyecto…" />;
  const d = data || {};
  const nombre = String(d.name || '').split(' ')[0];
  const pendientes = Array.isArray(d.pendientes) ? d.pendientes : [];
  const tareas = (Array.isArray(tareasData) ? tareasData : []).map((t) => ({ ...t, _tarea: true }));
  const completados = Array.isArray(d.completados) ? d.completados : [];
  const total = pendientes.length + tareas.length;
  const wa = (d.whatsapp || '').replace(/\D/g, '');

  return (
    <Screen style={{ background: T.bg }}>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '4px 0 6px', fontSize: 30, fontWeight: 800, color: T.ink, letterSpacing: '-0.03em' }}>Hola{nombre ? `, ${nombre}` : ''}</h1>
      <p style={{ margin: '0 0 16px', fontSize: 15.5, color: T.text2, lineHeight: 1.45 }}>
        {total > 0
          ? <>Necesitamos {total === 1 ? '1 cosa tuya' : `${total} cosas tuyas`} para seguir avanzando. Empieza por la primera.</>
          : <>Estás al día. No necesitamos nada de ti por ahora.</>}
      </p>

      {/* Avance del proyecto */}
      <div style={{ ...cardStyle, padding: '16px 18px', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>Avance de tu proyecto</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: d.todosTerminados ? T.green : T.primary, letterSpacing: '-0.02em' }}>{d.progreso ?? 0}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: '#EDEFF5', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: d.todosTerminados ? T.green : T.primary, width: `${Math.min(100, d.progreso ?? 0)}%`, transition: 'width .3s' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 10, fontSize: 12.5, color: T.text3, lineHeight: 1.4 }}>
          {d.todosTerminados
            ? <><PartyPopper size={14} color={T.green} style={{ flexShrink: 0, marginTop: 1 }} /> Embudos todos al aire. Ahora, optimizando los resultados.</>
            : <><PlusCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> Este número sube cuando subes el material que falta. Sin eso no podemos seguir.</>}
        </div>
      </div>

      {/* LO QUE TE FALTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' }}>Lo que te falta</h2>
        {total > 0 && <span style={{ fontSize: 12, fontWeight: 800, color: T.red, background: T.redSoft, borderRadius: 999, padding: '2px 9px' }}>{total}</span>}
      </div>

      {total === 0 ? (
        <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <CheckCircle2 size={20} color={T.green} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 14.5, fontWeight: 600, color: T.ink }}>Nada pendiente. Cuando necesitemos algo, aparece aquí.</span>
        </div>
      ) : (
        <div className="mk-grid2" style={{ marginBottom: 20 }}>
          {pendientes.map((p, i) => <PendienteCard key={p.id || p.tipo + i} p={p} nav={nav} />)}
          {tareas.map((t) => <TareaCard key={t.id} t={t} nav={nav} />)}
        </div>
      )}

      {/* Lo ya entregado */}
      {completados.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 4px', fontSize: 14, fontWeight: 600, color: T.text3 }}>
          <CheckCircle2 size={17} color={T.green} style={{ flexShrink: 0 }} />
          <span style={{ textDecoration: 'line-through' }}>Ya entregaste: {c.titulo}</span>
        </div>
      ))}

      <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13.5, color: T.text3 }}>
        ¿Algo no se entiende?{' '}
        {wa
          ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Escríbenos por WhatsApp.</a>
          : <b style={{ color: T.text2 }}>Escríbenos por WhatsApp.</b>}
      </div>
    </Screen>
  );
}

// Tarjeta de un pedido: ícono + título + por qué + hace cuánto + CTA exacto.
function PendienteCard({ p, nav }) {
  const esGrab = String(p.tipo || '').startsWith('grabacion');
  const esMeta = p.tipo === 'acceso_meta';
  const Icon = esGrab ? Video : esMeta ? KeyRound : Camera;
  const validando = p.estado === 'cliente_dice_listo';

  const abrir = () => {
    if (esGrab) nav(`/documento/${p.strategyId}/${p.docTipo || 'ads'}`);
    else if (esMeta) nav('/meta');
    else nav(`/pedido/${p.id}`, { state: { pedido: p } });
  };
  const cta = esGrab ? 'Abrir mis guiones' : esMeta ? (validando ? 'Ver el paso a paso' : 'Cómo se hace') : (p.tipo === 'fotos' ? 'Subir fotos' : 'Subir material');
  const caption = esGrab
    ? `Te lleva al documento, sección ${p.docTipo === 'vsl' ? 'VSL' : 'Ads'}`
    : validando ? 'Nos avisaste que ya está — lo estamos validando'
    : esMeta && p.bloqueante ? 'Nos está frenando'
    : (p.target ? `${p.subidos ?? 0} de ${p.target} subidas` : null);

  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <div style={{ display: 'flex', gap: 13 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={21} color={T.primary} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17.5, fontWeight: 800, color: T.ink, letterSpacing: '-0.01em', lineHeight: 1.25 }}>{p.titulo}</div>
          <div style={{ fontSize: 13.5, color: T.text2, lineHeight: 1.45, marginTop: 5 }}>{p.descripcion}</div>
        </div>
      </div>
      {p.dias != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12.5, fontWeight: 700, color: T.orange }}>
          <Clock size={13} /> Te lo pedimos {p.dias === 0 ? 'hoy' : p.dias === 1 ? 'hace 1 día' : `hace ${p.dias} días`}
        </div>
      )}
      <button onClick={abrir} style={{ ...bigBtn(), marginTop: 12 }}>{cta} <ChevronRight size={15} /></button>
      {caption && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, fontWeight: caption === 'Nos está frenando' ? 800 : 600, color: caption === 'Nos está frenando' ? T.red : validando ? T.green : T.text3 }}>
          {caption}
        </div>
      )}
    </div>
  );
}

// Tarea del sistema de operaciones asignada al cliente (desaparece al validarse).
function TareaCard({ t, nav }) {
  const dest = destinoTarea(t);
  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <div style={{ display: 'flex', gap: 13 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, background: T.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ClipboardList size={21} color={T.orange} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: T.ink, lineHeight: 1.3 }}>{t.titulo}</div>
          {t.funnel && <div style={{ fontSize: 12.5, color: T.text3, marginTop: 4 }}>Embudo {t.funnel}</div>}
        </div>
      </div>
      {t.dias != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12.5, fontWeight: 700, color: T.orange }}>
          <Clock size={13} /> Te lo pedimos {t.dias === 0 ? 'hoy' : t.dias === 1 ? 'hace 1 día' : `hace ${t.dias} días`}
        </div>
      )}
      {dest && <button onClick={() => nav(dest.to, { state: dest.state })} style={{ ...bigBtn(T.ink), marginTop: 12 }}>{dest.cta} <ChevronRight size={15} /></button>}
    </div>
  );
}

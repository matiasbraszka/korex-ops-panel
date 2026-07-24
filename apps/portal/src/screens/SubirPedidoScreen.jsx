import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Check, X, Loader2, ImagePlus, Sun, Users, Ban } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { useAsync } from '../components/ui';
import { api, isDemo, uploadRecurso, simulateUpload } from '../data/portalApi';
import { T, cardStyle, microLabel, bigBtn } from '../components/theme';

// SUBIR MATERIAL de un pedido ("Sube 5 fotos tuyas", "Tu logo y tus colores"…):
// explicación con ejemplos, subida múltiple y progreso "X de Y subidas".
// El archivo cae en la carpeta REAL de operaciones (pedido.bucket).
export default function SubirPedidoScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);

  // El pedido viaja en el state; si entran por link directo, se busca en inicio().
  const { data: inicioData } = useAsync(() => (location.state?.pedido ? Promise.resolve(null) : api.inicio()), [id]);
  const pedido = location.state?.pedido
    || (Array.isArray(inicioData?.pendientes) ? inicioData.pendientes.find((p) => p.id === id) : null);

  const [subidas, setSubidas] = useState([]);   // {uid,name,pct,done,error}
  const demo = isDemo();
  let _uid = useRef(0);

  if (!pedido) {
    return (
      <PhoneFrame>
        <Back nav={nav} />
        <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>Cargando el pedido…</div>
      </PhoneFrame>
    );
  }

  const esFotos = pedido.tipo === 'fotos';
  const target = pedido.target || null;
  const okCount = (pedido.subidos || 0) + subidas.filter((u) => u.done).length;

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    files.forEach((file) => {
      const uid = 'u' + (++_uid.current);
      setSubidas((prev) => [{ uid, name: file.name, pct: 0, done: false, error: false }, ...prev]);
      const onProgress = (f) => setSubidas((prev) => prev.map((u) => (u.uid === uid ? { ...u, pct: Math.round(f * 100) } : u)));
      const done = () => setSubidas((prev) => prev.map((u) => (u.uid === uid ? { ...u, pct: 100, done: true } : u)));
      const fail = () => setSubidas((prev) => prev.map((u) => (u.uid === uid ? { ...u, error: true } : u)));
      if (demo) simulateUpload(file, onProgress, done);
      else uploadRecurso(pedido.bucket, file, onProgress, { strategyId: pedido.strategyId || null }).then(done).catch(fail);
    });
  };

  return (
    <PhoneFrame>
      <Back nav={nav} />
      <div style={{ padding: '4px 20px 28px', overflowY: 'auto', background: T.bg, flex: 1 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 25, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          {esFotos ? `Necesitamos ${target || 'tus'} fotos tuyas` : pedido.titulo}
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 14.5, color: T.text2, lineHeight: 1.5 }}>
          {pedido.descripcion}{esFotos ? ' Que se te vea la cara y haya buena luz.' : ''}
        </p>

        {/* Así sí, así no (solo para fotos) */}
        {esFotos && (
          <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ aspectRatio: '3/4', borderRadius: 12, background: '#EDEFF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                  <ImagePlus size={20} color="#B9C0CC" />
                  <span style={microLabel('#B9C0CC')}>Ejemplo</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 8 }}>Así sí, así no</div>
            <Regla ok Icon={Sun} texto="De frente, con luz natural y fondo simple" />
            <Regla ok Icon={Users} texto="Alguna dando una charla o con tu equipo" />
            <Regla Icon={Ban} texto="Borrosas, grupales o con filtros" />
          </div>
        )}

        {/* Subida */}
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 110, borderRadius: 16, border: `2px dashed ${T.primary}55`, background: T.primarySoft, cursor: 'pointer', padding: 16, marginBottom: 14 }}>
          <input ref={inputRef} type="file" multiple onChange={onPick} accept="image/*,video/*,.pdf" style={{ display: 'none' }} />
          <ImagePlus size={30} color={T.primary} />
          <span style={{ fontSize: 16, fontWeight: 800, color: T.primary }}>{esFotos ? 'Elige las fotos del celular' : 'Elige los archivos'}</span>
          <span style={{ fontSize: 12.5, color: T.text2 }}>Puedes subir varias juntas. Nosotros las guardamos donde van.</span>
        </label>

        {/* Ya subiste */}
        {(okCount > 0 || subidas.length > 0) && (
          <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>Ya subiste</span>
              {target && <span style={microLabel(okCount >= target ? T.green : T.primary)}>{Math.min(okCount, target)} de {target} subidas</span>}
            </div>
            {subidas.map((u) => (
              <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderTop: '1px solid #F0F2F5', fontSize: 13.5, fontWeight: 600, color: T.text }}>
                {u.error ? <X size={15} color={T.red} /> : u.done ? <Check size={15} color={T.green} strokeWidth={3} /> : <Loader2 size={14} color={T.primary} className="mk-spin" />}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                {!u.done && !u.error && <span style={{ fontSize: 12, color: T.text3 }}>{u.pct}%</span>}
              </div>
            ))}
            {pedido.subidos > 0 && subidas.length === 0 && (
              <div style={{ fontSize: 13, color: T.text3 }}>Ya tenemos {pedido.subidos} {pedido.subidos === 1 ? 'archivo' : 'archivos'} tuyos en esta carpeta.</div>
            )}
          </div>
        )}

        <button onClick={() => nav('/')} style={{ ...bigBtn('#FFFFFF'), color: T.text2, border: `1px solid ${T.border}` }}>Lo hago más tarde</button>
      </div>
    </PhoneFrame>
  );
}

function Regla({ ok = false, Icon, texto }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', fontSize: 13.5, fontWeight: 600, color: ok ? T.text : T.text3 }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, background: ok ? T.greenSoft : T.redSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} color={ok ? T.green : T.red} />
      </span>
      <span style={{ textDecoration: ok ? 'none' : 'line-through' }}>{texto}</span>
    </div>
  );
}

function Back({ nav }) {
  return (
    <div style={{ position: 'sticky', top: 0, background: T.bg, padding: '14px 20px 8px', zIndex: 10 }}>
      <button onClick={() => nav(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: T.primary, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', padding: '6px 0' }}>
        <ChevronLeft size={17} /> Volver
      </button>
    </div>
  );
}

import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import { useAsync, Spinner } from '../components/ui';
import { api, isDemo, uploadRecurso, simulateUpload } from '../data/portalApi';
import { T, display, pill } from '../components/theme';
import { IcoChevL, IcoCheck, IcoX, IcoArrowUp } from '../components/icons';

// SUBIR MATERIAL de un pedido ("Sube 5 fotos tuyas", "Tu logo y tus colores"…)
// — exacta al prototipo: ejemplos, "Así sí, así no", subida y "Ya subiste".
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
  const _uid = useRef(0);

  if (!pedido) {
    return (
      <PhoneFrame><KxScreen>
        <div className="kxs" style={{ flex: 1 }}><Volver nav={nav} /><div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>Cargando el pedido…</div></div>
      </KxScreen></PhoneFrame>
    );
  }

  const esFotos = pedido.tipo === 'fotos';
  const esLogo = pedido.tipo === 'logo' || /logo|marca|brand/i.test(pedido.bucket || '') || /logo/i.test(pedido.titulo || '');
  const target = pedido.target || null;
  const okCount = (pedido.subidos || 0) + subidas.filter((u) => u.done).length;
  const listo = target ? okCount >= target : false;
  const label = target ? `${Math.min(okCount, target)} de ${target} subidas` : `${okCount} ${okCount === 1 ? 'archivo' : 'archivos'}`;

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
      <KxScreen>
        <div className="kxs" style={{ flex: 1, overflowY: 'auto' }}>
          <Volver nav={nav} />

          <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ ...display(29, '-0.035em'), textWrap: 'balance' }}>{esFotos && target ? `Necesitamos ${target} fotos tuyas` : pedido.titulo}</div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: T.textSoft, textWrap: 'pretty' }}>
              {pedido.descripcion}{esFotos ? ' Que se te vea la cara y haya buena luz.' : ''}
            </div>
          </div>

          {/* Ejemplos + "Así sí, así no" (fotos y logo, como el prototipo) */}
          {(esFotos || esLogo) && (
            <div style={{ margin: '22px 22px 0', background: '#fff', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', gap: 2, height: 128, background: 'var(--mk-border-light)' }}>
                {(esFotos
                  ? [['linear-gradient(160deg,#E4E8EF,#CFD5DF)', 'Ejemplo'], ['linear-gradient(160deg,#E9EDF4,#D5DBE4)', 'Ejemplo'], ['linear-gradient(160deg,#E4E8EF,#CFD5DF)', 'Ejemplo']]
                  : [['linear-gradient(160deg,#E9EDF4,#D5DBE4)', 'Tu logo'], ['linear-gradient(160deg,#E4E8EF,#CFD5DF)', 'Tus colores'], ['linear-gradient(160deg,#E9EDF4,#D5DBE4)', 'Tipografía']]
                ).map(([bg, label], i) => (
                  <div key={i} style={{ flex: 1, background: bg, display: 'flex', alignItems: 'flex-end', padding: 9, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.text2 }}>{label}</div>
                ))}
              </div>
              <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: '-0.025em', color: T.ink }}>Así sí, así no</div>
                {esFotos ? (
                  <>
                    <Regla ok texto="De frente, con luz natural y fondo simple" />
                    <Regla ok texto="Alguna dando una charla o con tu equipo" />
                    <Regla texto="Borrosas, grupales o con filtros" />
                  </>
                ) : (
                  <>
                    <Regla ok texto="El logo en la mejor calidad que tengas (ideal PNG con fondo transparente)" />
                    <Regla ok texto="Tus colores de marca: sirve una captura, el manual de marca o los códigos" />
                    <Regla ok texto="Si usas una tipografía específica, dinos cuál" />
                    <Regla texto="Fotos del logo impreso o capturas borrosas y chiquitas" />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Subida (pendiente) o "Listo, las recibimos" */}
          {!listo ? (
            <label style={{ display: 'flex', margin: '16px 22px 0', background: '#fff', border: '2px dashed #C3CFEF', borderRadius: 22, padding: '28px 20px', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input ref={inputRef} type="file" multiple onChange={onPick} accept="image/*,video/*,.pdf" style={{ display: 'none' }} />
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IcoArrowUp size={24} stroke="#fff" sw={2.4} />
              </div>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '-0.025em', textAlign: 'center', color: T.ink }}>
                {esFotos ? 'Elige las fotos del celular' : 'Elige los archivos'}
              </div>
              <div style={{ fontSize: 13, color: T.text2, textAlign: 'center', lineHeight: 1.5 }}>Puedes subir varias juntas. Nosotros las guardamos donde van.</div>
            </label>
          ) : (
            <div style={{ margin: '16px 22px 0', background: 'var(--mk-green-bg)', borderRadius: 22, padding: '22px 20px', display: 'flex', alignItems: 'center', gap: 14, animation: 'kxUp .3s ease' }}>
              <div style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--mk-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IcoCheck size={22} stroke="#fff" sw={2.8} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: T.ink }}>Listo, las recibimos</div>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: T.textSoft }}>Ya no tienes nada pendiente aquí.</div>
              </div>
            </div>
          )}

          {/* Ya subiste */}
          {(okCount > 0 || subidas.length > 0) && (
            <div style={{ padding: '24px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '-0.025em', color: T.ink }}>Ya subiste</div>
                <span style={pill('var(--mk-purple-bg)', 'var(--mk-purple)')}>{label}</span>
              </div>
              <div style={{ background: '#fff', borderRadius: 20, padding: '6px 4px', boxShadow: 'var(--shadow-md)' }}>
                {subidas.map((u) => (
                  <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: '#E4E8EF', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                    {u.error ? <IcoX size={19} stroke="var(--mk-red)" sw={2.4} />
                      : u.done ? <IcoCheck size={19} stroke="var(--mk-green)" sw={2.4} />
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text3 }}><Spinner size={14} />{u.pct}%</span>}
                  </div>
                ))}
                {pedido.subidos > 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 13, color: T.text3 }}>
                    Ya tenemos {pedido.subidos} {pedido.subidos === 1 ? 'archivo' : 'archivos'} tuyos en esta carpeta.
                  </div>
                )}
              </div>
            </div>
          )}
          <div style={{ height: 26 }} />
        </div>

        {/* Footer fijo */}
        <div data-kx-footer="" style={{ flex: 'none', padding: '16px 22px 28px', background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(10px)', boxShadow: '0 -1px 0 var(--mk-border)' }}>
          <div onClick={() => nav('/')} role="button" style={{ cursor: 'pointer', height: 52, borderRadius: 999, background: T.ink, color: '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {listo ? 'Volver al inicio' : 'Lo hago más tarde'}
          </div>
        </div>
      </KxScreen>
    </PhoneFrame>
  );
}

function Regla({ ok = false, texto }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {ok
        ? <IcoCheck size={18} stroke="var(--mk-green)" sw={2.4} style={{ flex: 'none', marginTop: 2 }} />
        : <IcoX size={18} stroke="var(--mk-red)" sw={2.4} style={{ flex: 'none', marginTop: 2 }} />}
      <span style={{ fontSize: 14, lineHeight: 1.5, color: ok ? T.textSoft : T.text2 }}>{texto}</span>
    </div>
  );
}

function Volver({ nav }) {
  return (
    <div onClick={() => nav(-1)} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 0', color: T.primary, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      <IcoChevL size={17} stroke="var(--mk-blue-ops)" sw={2.4} />
      Volver
    </div>
  );
}

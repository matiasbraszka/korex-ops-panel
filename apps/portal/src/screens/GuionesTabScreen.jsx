import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame';
import { Loading, useAsync } from '../components/ui';
import { api } from '../data/portalApi';
import { T } from '../components/theme';
import { IcoComment, IcoMenu, IcoArrowR } from '../components/icons';
import logo from '../assets/logo-korex.svg';

const WELCOME_KEY = 'korex_portal_guiones_bienvenida';

// Tab GUIONES — como en el prototipo, NO hay lista intermedia: la primera vez
// se muestra la bienvenida (los 3 gestos, animada) y después el tab lleva
// DIRECTO al documento de Ads del embudo que tiene guiones pendientes.
export default function GuionesTabScreen() {
  const nav = useNavigate();
  const { data: funnels, loading } = useAsync(() => api.funnels(), []);
  const [intro, setIntro] = useState(() => { try { return !localStorage.getItem(WELCOME_KEY); } catch { return false; } });

  // El destino: primer embudo con guiones sin grabar (o el primero con guiones).
  const destino = useMemo(() => {
    const fs = Array.isArray(funnels) ? funnels : [];
    const con = fs.filter((f) => (f.guionesTotal || 0) > 0);
    const pend = con.find((f) => (f.guionesGrabados || 0) < (f.guionesTotal || 0));
    return pend || con[0] || null;
  }, [funnels]);

  useEffect(() => {
    if (!intro && !loading && destino) nav(`/documento/${destino.id}/ads`, { replace: true });
  }, [intro, loading, destino, nav]);

  if (loading) return <PhoneFrame><Loading label="Buscando tus guiones…" /></PhoneFrame>;

  if (!destino) {
    return (
      <PhoneFrame>
        <div style={{ padding: '60px 30px', textAlign: 'center', color: T.text2, fontSize: 14.5, lineHeight: 1.5 }}>
          Todavía no hay guiones marcados para grabar.<br />Cuando el equipo los prepare, aparecen aquí.
        </div>
      </PhoneFrame>
    );
  }

  if (!intro) return <PhoneFrame><Loading label="Abriendo tus guiones…" /></PhoneFrame>;

  const cerrarIntro = () => {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* */ }
    setIntro(false);
    nav(`/documento/${destino.id}/ads`);
  };

  // ── BIENVENIDA (exacta al prototipo, con los demos animados) ──
  return (
    <PhoneFrame>
      <div className="kxs" data-kx-plain="" style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box', background: 'linear-gradient(180deg, var(--mk-blue-bg2) 0%, var(--mk-bg-panel) 34%)', padding: '44px 20px 30px', animation: 'kxFade .25s ease' }}>
        <img src={logo} alt="Método Korex" style={{ height: 26, width: 'auto', display: 'block', marginBottom: 20 }} />
        <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: T.ink, lineHeight: 1.15, marginBottom: 10 }}>
          Aquí viven tus guiones,<br />listos para leer y grabar.
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

        {/* 2 · Comenta (subrayado animado kxHi + botón kxPop) */}
        <div style={introCard}>
          <div style={introHead}>
            <span style={introNum}>2</span>
            <div style={introTitle}>Comenta lo que quieras cambiar</div>
          </div>
          <div style={{ position: 'relative', background: 'var(--mk-bg-panel)', border: '1px solid #EEF0F4', borderRadius: 14, padding: '16px 16px 46px', overflow: 'hidden' }}>
            <div style={{ fontSize: 13, lineHeight: 1.72, color: T.text3, fontWeight: 500 }}>
              Si estás cansado de <span style={{ backgroundImage: 'linear-gradient(rgba(234,179,8,.42),rgba(234,179,8,.42))', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', backgroundSize: '0% 82%', borderRadius: 3, color: T.textSoft, fontWeight: 600, animation: 'kxHi 3.6s ease-in-out infinite' }}>perseguir a amigos y familiares</span> para que se sumen a tu negocio, quédate 30 segundos.
            </div>
            <div style={{ position: 'absolute', right: 14, bottom: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--mk-blue-ops)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 999, boxShadow: 'var(--shadow-md)', animation: 'kxPop 3.6s ease-in-out infinite' }}>
              <IcoComment size={13} stroke="currentColor" sw={2.2} />
              Comentar
            </div>
          </div>
          <div style={introCaption}>Mantén el dedo y <b style={{ color: T.textSoft }}>selecciona un fragmento</b>. Aparece el botón para dejar tu nota.</div>
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

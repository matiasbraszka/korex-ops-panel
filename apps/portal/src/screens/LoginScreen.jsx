import { useState } from 'react';
import PhoneFrame from '../components/PhoneFrame';
import { usePortalAuth } from '../auth/PortalAuthProvider';
import { Spinner } from '../components/ui';
import { IcoArrowR } from '../components/icons';
import { T, microLabel } from '../components/theme';
import logo from '../assets/logo-korex.svg';

// ENTRAR — exacta al prototipo ("Tu espacio de trabajo con Método Korex"),
// con email + contraseña (decisión de Matías: sin magic link).
export default function LoginScreen() {
  const { signIn, resetPassword, enterDemo } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setMsg({ type: 'error', text: traducir(err?.message) });
    } finally {
      setBusy(false);
    }
  };

  const recuperar = async () => {
    if (!email.trim()) { setMsg({ type: 'error', text: 'Escribe tu email arriba y toca de nuevo.' }); return; }
    try {
      await resetPassword(email);
      setMsg({ type: 'ok', text: 'Te enviamos un email para recuperar tu contraseña.' });
    } catch (err) {
      setMsg({ type: 'error', text: traducir(err?.message) });
    }
  };

  return (
    <PhoneFrame>
      <div data-kx-plain="" className="kxs" style={{ height: '100%', boxSizing: 'border-box', background: 'linear-gradient(180deg, var(--mk-blue-bg2) 0%, #fff 46%)', padding: '0 26px', display: 'flex', flexDirection: 'column', overflowY: 'auto', animation: 'kxFade .3s ease' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24, padding: '40px 0 60px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <img src={logo} alt="Método Korex" style={{ height: 42, width: 'auto', alignSelf: 'flex-start' }} />
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 29, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.12, color: T.ink }}>
              Tu espacio de trabajo<br />con Método Korex
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: T.text2, textWrap: 'pretty' }}>
              Aquí vas a ver qué necesitamos de ti y dónde están tus guiones para grabar.
            </div>
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ ...microLabel(), letterSpacing: '0.1em', fontSize: 12, fontWeight: 700 }}>Tu email</div>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" style={inp} />
            <div style={{ ...microLabel(), letterSpacing: '0.1em', fontSize: 12, fontWeight: 700, marginTop: 2 }}>Tu contraseña</div>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={inp} />

            {msg && (
              <div style={{ fontSize: 14, fontWeight: 600, padding: '10px 14px', borderRadius: 12, background: msg.type === 'ok' ? 'var(--mk-green-bg)' : 'var(--mk-red-bg)', color: msg.type === 'ok' ? 'var(--mk-green)' : 'var(--mk-red)' }}>
                {msg.text}
              </div>
            )}

            <button type="submit" disabled={busy} style={{ cursor: 'pointer', height: 54, border: 'none', borderRadius: 999, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 22px rgba(91,124,245,.34)', opacity: busy ? 0.75 : 1 }}>
              {busy ? <Spinner size={20} color="#fff" /> : <>Entrar<IcoArrowR size={17} stroke="#fff" sw={2.4} /></>}
            </button>
            <button type="button" onClick={recuperar} style={{ margin: '4px auto 0', border: 'none', background: 'none', color: T.text2, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              ¿Olvidaste tu contraseña?
            </button>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: T.text3, textAlign: 'center' }}>
              Si no tienes tu clave, pídela por WhatsApp: te la damos al instante.
            </div>
          </form>

          {/* El demo es una herramienta INTERNA (datos de ejemplo): localhost o ?demo. */}
          {(window.location.hostname === 'localhost' || new URLSearchParams(window.location.search).has('demo')) && (
            <div style={{ paddingTop: 18, borderTop: '1px solid var(--mk-border)', textAlign: 'center' }}>
              <button onClick={enterDemo} style={{ border: '1px solid var(--mk-border)', background: '#fff', color: T.ink, fontSize: 14, fontWeight: 700, borderRadius: 999, padding: '10px 18px', cursor: 'pointer' }}>
                Ver demo (sin cuenta)
              </button>
              <div style={{ marginTop: 8, fontSize: 12, color: T.text3 }}>Para revisar la plataforma con datos de ejemplo.</div>
            </div>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}

const inp = { height: 52, borderRadius: 14, border: '1px solid var(--mk-border)', boxShadow: 'var(--shadow-sm)', padding: '0 16px', fontSize: 15, fontFamily: 'inherit', color: 'var(--mk-text)', outline: 'none', background: '#fff' };

function traducir(m) {
  if (!m) return 'No pudimos entrar. Prueba de nuevo.';
  if (/invalid login|credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Tu email todavía no está confirmado. Escríbenos por WhatsApp.';
  return m;
}

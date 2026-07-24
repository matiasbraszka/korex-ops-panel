import { useState } from 'react';
import PhoneFrame from '../components/PhoneFrame';
import { usePortalAuth } from '../auth/PortalAuthProvider';
import { Spinner } from '../components/ui';
import { T, bigBtn, microLabel } from '../components/theme';

// ENTRAR (diseño nuevo): "Tu espacio de trabajo con Método Korex".
// Login con email + contraseña (decisión de Matías: sin magic link).
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '28px 24px', background: T.bg }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 30, color: T.primary, letterSpacing: '-0.05em', marginBottom: 22 }}>mk<span style={{ color: T.ink, fontSize: 11, verticalAlign: 'super' }}>●</span></span>
        <h1 style={{ margin: '0 0 4px', fontSize: 31, fontWeight: 800, color: T.ink, letterSpacing: '-0.03em', lineHeight: 1.12 }}>
          Tu espacio de trabajo<br /><span style={{ color: T.text3 }}>con Método Korex</span>
        </h1>
        <p style={{ margin: '10px 0 26px', fontSize: 15.5, color: T.text2, lineHeight: 1.5 }}>
          Aquí vas a ver qué necesitamos de ti y dónde están tus guiones para grabar.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={microLabel()}>Tu email</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" style={inp} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={microLabel()}>Tu contraseña</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={inp} />
          </label>

          {msg && (
            <div style={{ fontSize: 14, fontWeight: 600, padding: '10px 14px', borderRadius: 12, background: msg.type === 'ok' ? T.greenSoft : T.redSoft, color: msg.type === 'ok' ? T.green : T.red }}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={busy} style={{ ...bigBtn(), height: 54, fontSize: 13.5, opacity: busy ? 0.7 : 1 }}>
            {busy ? <Spinner size={20} color="#fff" /> : 'Entrar'}
          </button>
        </form>

        <button onClick={recuperar} style={{ margin: '14px auto 0', border: 'none', background: 'none', color: T.text2, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          ¿Olvidaste tu contraseña?
        </button>
        <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12.5, color: T.text3 }}>
          Si no tienes tu clave, pídela por WhatsApp: te la damos al instante.
        </div>

        {/* El demo es una herramienta INTERNA (datos de ejemplo): localhost o ?demo. */}
        {(window.location.hostname === 'localhost' || new URLSearchParams(window.location.search).has('demo')) && (
          <div style={{ marginTop: 26, paddingTop: 18, borderTop: `1px solid ${T.border}`, textAlign: 'center' }}>
            <button onClick={enterDemo} style={{ border: `1px solid ${T.border}`, background: '#FFFFFF', color: T.ink, fontSize: 14, fontWeight: 700, borderRadius: 999, padding: '10px 18px', cursor: 'pointer' }}>
              Ver demo (sin cuenta)
            </button>
            <div style={{ marginTop: 8, fontSize: 12, color: T.text3 }}>Para revisar la plataforma con datos de ejemplo.</div>
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}

const inp = { height: 52, borderRadius: 14, border: '1px solid #DDE0E8', padding: '0 16px', fontSize: 16, fontFamily: 'inherit', color: '#171B26', outline: 'none', background: '#fff' };

function traducir(m) {
  if (!m) return 'No pudimos entrar. Prueba de nuevo.';
  if (/invalid login|credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Tu email todavía no está confirmado. Escríbenos por WhatsApp.';
  return m;
}

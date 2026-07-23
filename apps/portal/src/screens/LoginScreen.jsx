import { useState } from 'react';
import PhoneFrame from '../components/PhoneFrame';
import { usePortalAuth } from '../auth/PortalAuthProvider';
import { Spinner } from '../components/ui';

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
    if (!email.trim()) { setMsg({ type: 'error', text: 'Escribí tu email arriba y tocá de nuevo.' }); return; }
    try {
      await resetPassword(email);
      setMsg({ type: 'ok', text: 'Te enviamos un email para recuperar tu contraseña.' });
    } catch (err) {
      setMsg({ type: 'error', text: traducir(err?.message) });
    }
  };

  return (
    <PhoneFrame>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '28px 22px' }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 30, color: '#FFFFFF', letterSpacing: '-0.03em' }}>K</span>
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#1A1D26', textAlign: 'center', letterSpacing: '-0.02em' }}>Tu plataforma</h1>
        <p style={{ margin: '0 0 26px', fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 1.4 }}>Ingresá con el email y la contraseña que te dio Método Korex.</p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={lbl}>Email
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" style={inp} />
          </label>
          <label style={lbl}>Contraseña
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={inp} />
          </label>

          {msg && (
            <div style={{ fontSize: 14, fontWeight: 600, padding: '10px 14px', borderRadius: 12, background: msg.type === 'ok' ? '#ECFDF5' : '#FEF2F2', color: msg.type === 'ok' ? '#16A34A' : '#DC2626' }}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={busy} style={{ height: 56, borderRadius: 14, border: 'none', background: '#5B7CF5', color: '#FFFFFF', fontSize: 17, fontWeight: 700, cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: busy ? 0.7 : 1 }}>
            {busy ? <Spinner size={20} color="#fff" /> : 'Entrar'}
          </button>
        </form>

        <button onClick={recuperar} style={{ margin: '16px auto 0', border: 'none', background: 'none', color: '#6B7280', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          ¿Olvidaste tu contraseña?
        </button>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #E2E5EB', textAlign: 'center' }}>
          <button onClick={enterDemo} style={{ border: '1px solid #D0D5DD', background: '#FFFFFF', color: '#1A1D26', fontSize: 14, fontWeight: 700, borderRadius: 999, padding: '10px 18px', cursor: 'pointer' }}>
            Ver demo (sin cuenta)
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: '#9CA3AF' }}>Para revisar la plataforma con datos de ejemplo.</div>
        </div>
      </div>
    </PhoneFrame>
  );
}

const lbl = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: '#6B7280' };
const inp = { height: 54, borderRadius: 14, border: '1px solid #D0D5DD', padding: '0 16px', fontSize: 16, fontFamily: 'inherit', color: '#1A1D26', outline: 'none' };

function traducir(m) {
  if (!m) return 'No pudimos ingresar. Probá de nuevo.';
  if (/invalid login|credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Tu email todavía no está confirmado. Escribinos por WhatsApp.';
  return m;
}

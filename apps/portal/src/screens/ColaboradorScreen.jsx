import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PhoneFrame from '../components/PhoneFrame';
import { usePortalAuth } from '../auth/PortalAuthProvider';
import { Spinner } from '../components/ui';
import { IcoArrowR } from '../components/icons';
import { T, microLabel } from '../components/theme';
import logo from '../assets/logo-korex.svg';

// SUMARSE AL EQUIPO DEL CLIENTE — pantalla pública (sin cuenta) que abre el
// colaborador con el link que el equipo comparte desde Operaciones. Completa un
// mini formulario y elige su contraseña; queda con acceso al mismo espacio que
// el cliente. Redacción en español neutro.
const ROLES = ['Asistente', 'Encargado de grabarse', 'Líder Principal', 'Socio', 'Otro'];

export default function ColaboradorScreen() {
  const [params] = useSearchParams();
  const token = (params.get('t') || '').trim();
  const { signIn } = usePortalAuth();
  const navigate = useNavigate();

  const [estado, setEstado] = useState('cargando'); // cargando | ok | invalido | listo
  const [clientName, setClientName] = useState('');
  const [f, setF] = useState({ full_name: '', phone: '', email: '', password: '', role: 'Asistente' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let vivo = true;
    if (!token) { setEstado('invalido'); return; }
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('colaborador-registro', { body: { action: 'info', token } });
        if (!vivo) return;
        if (data?.ok) { setClientName(data.client_name || ''); setEstado('ok'); }
        else setEstado('invalido');
      } catch { if (vivo) setEstado('invalido'); }
    })();
    return () => { vivo = false; };
  }, [token]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('colaborador-registro', {
        body: { action: 'register', token, ...f, email: f.email.trim() },
      });
      if (error || !data?.ok) {
        setMsg({ type: 'error', text: data?.detail || traducir(data?.error) });
        return;
      }
      // Cuenta lista → entrar directo con su email y contraseña.
      setEstado('listo');
      try { await signIn(f.email.trim(), f.password); navigate('/', { replace: true }); }
      catch { setMsg({ type: 'ok', text: 'Tu cuenta quedó lista. Entra con tu email y contraseña.' }); }
    } catch {
      setMsg({ type: 'error', text: 'No pudimos crear tu cuenta. Prueba de nuevo.' });
    } finally { setBusy(false); }
  };

  return (
    <PhoneFrame>
      <div data-kx-plain="" className="kxs" style={{ height: '100%', boxSizing: 'border-box', background: 'linear-gradient(180deg, var(--mk-blue-bg2) 0%, #fff 46%)', padding: '0 26px', display: 'flex', flexDirection: 'column', overflowY: 'auto', animation: 'kxFade .3s ease' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20, padding: '36px 0 56px' }}>
          <img src={logo} alt="Método Korex" style={{ height: 40, width: 'auto', alignSelf: 'flex-start' }} />

          {estado === 'cargando' && (
            <div style={{ margin: '30px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Spinner size={26} /><div style={{ fontSize: 14, color: T.text2 }}>Abriendo la invitación…</div>
            </div>
          )}

          {estado === 'invalido' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 25, fontWeight: 800, letterSpacing: '-0.03em', color: T.ink }}>
                Este enlace no es válido
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.55, color: T.text2 }}>
                Puede que haya vencido o esté mal copiado. Pídele al equipo un enlace nuevo para sumarte.
              </div>
            </div>
          )}

          {(estado === 'ok' || estado === 'listo') && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-0.032em', lineHeight: 1.14, color: T.ink }}>
                  Súmate al equipo{clientName ? <> de<br />{clientName}</> : ''}
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.55, color: T.text2, textWrap: 'pretty' }}>
                  Crea tu cuenta para ayudar con el onboarding, subir material y ver los guiones. Tendrás acceso al mismo espacio de trabajo.
                </div>
              </div>

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <Label>Nombre completo</Label>
                <input value={f.full_name} onChange={set('full_name')} placeholder="Tu nombre y apellido" style={inp} autoComplete="name" />

                <Label>Teléfono</Label>
                <input value={f.phone} onChange={set('phone')} placeholder="Ej.: +54 9 11 5555 5555" style={inp} inputMode="tel" autoComplete="tel" />

                <Label>Email</Label>
                <input type="email" value={f.email} onChange={set('email')} placeholder="tu@email.com" style={inp} autoComplete="email" />

                <Label>¿Qué haces en el equipo?</Label>
                <select value={f.role} onChange={set('role')} style={{ ...inp, appearance: 'auto' }}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>

                <Label>Crea tu contraseña</Label>
                <input type="password" value={f.password} onChange={set('password')} placeholder="Mínimo 6 caracteres" style={inp} autoComplete="new-password" />

                {msg && (
                  <div style={{ fontSize: 14, fontWeight: 600, padding: '10px 14px', borderRadius: 12, background: msg.type === 'ok' ? 'var(--mk-green-bg)' : 'var(--mk-red-bg)', color: msg.type === 'ok' ? 'var(--mk-green)' : 'var(--mk-red)' }}>
                    {msg.text}
                  </div>
                )}

                <button type="submit" disabled={busy} style={{ marginTop: 4, cursor: 'pointer', height: 54, border: 'none', borderRadius: 999, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 22px rgba(91,124,245,.34)', opacity: busy ? 0.75 : 1 }}>
                  {busy ? <Spinner size={20} color="#fff" /> : <>Crear mi cuenta<IcoArrowR size={17} stroke="#fff" sw={2.4} /></>}
                </button>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: T.text3, textAlign: 'center' }}>
                  Al crear tu cuenta entras al instante.
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}

function Label({ children }) {
  return <div style={{ ...microLabel(), letterSpacing: '0.1em', fontSize: 12, fontWeight: 700, marginTop: 2 }}>{children}</div>;
}

const inp = { height: 52, borderRadius: 14, border: '1px solid var(--mk-border)', boxShadow: 'var(--shadow-sm)', padding: '0 16px', fontSize: 15, fontFamily: 'inherit', color: 'var(--mk-text)', outline: 'none', background: '#fff' };

function traducir(code) {
  const m = {
    invite_invalido: 'El enlace no es válido o venció. Pide uno nuevo al equipo.',
    email_invalido: 'Revisa el email.',
    email_en_uso: 'Ese email ya tiene una cuenta. Entra desde el login.',
    email_equipo: 'Usa tu email personal (no uno del equipo Korex).',
    password_corta: 'La contraseña necesita al menos 6 caracteres.',
    falta_nombre: 'Escribe tu nombre completo.',
    cliente_sin_cuenta: 'La cuenta del cliente todavía no está lista. Avísale al equipo.',
  };
  return m[code] || 'No pudimos crear tu cuenta. Prueba de nuevo.';
}

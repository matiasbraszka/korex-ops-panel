import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { HelpCircle, X, Play, LogOut, KeyRound, Copy, Check, Eye, EyeOff, ExternalLink } from 'lucide-react';
import PhoneFrame from './PhoneFrame';
import { api } from '../data/portalApi';
import { useAsync } from './ui';
import { usePortalAuth } from '../auth/PortalAuthProvider';

function Header({ clientName, onAccesos, onTutoriales, onSignOut }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, background: '#FFFFFF', borderBottom: '1px solid #E2E5EB', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 17, color: '#FFFFFF', letterSpacing: '-0.03em' }}>K</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9CA3AF' }}>Método Korex</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D26', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clientName || '…'}</div>
      </div>
      {/* Accesos: las claves de SUS plataformas (CRM, web) que le carga el equipo. */}
      <button onClick={onAccesos} aria-label="Tus accesos" style={iconBtn}>
        <KeyRound size={20} color="#B45309" />
      </button>
      <button onClick={onTutoriales} aria-label="Tutoriales" style={iconBtn}>
        <HelpCircle size={22} color="#5B7CF5" />
      </button>
      <button onClick={onSignOut} aria-label="Salir" style={iconBtn}>
        <LogOut size={20} color="#9CA3AF" />
      </button>
    </header>
  );
}

// Hoja de "Tus accesos": el cliente ve las claves de sus propias plataformas
// (las mismas que el equipo guarda en operaciones → Accesos del cliente).
function AccesosSheet({ onClose }) {
  const { data } = useAsync(() => api.accesos(), []);
  const items = data || [];
  const [show, setShow] = useState({});
  const [copied, setCopied] = useState('');
  const copiar = async (txt, key) => { try { await navigator.clipboard.writeText(txt); setCopied(key); setTimeout(() => setCopied(''), 1400); } catch { /* nada */ } };
  const fila = (label, valor, key, secreta = false) => !valor ? null : (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #F0F2F5' }}>
      <span style={{ width: 86, fontSize: 12, color: '#9CA3AF', flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: '#1A1D26', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: secreta ? 'ui-monospace, monospace' : 'inherit' }}>
        {secreta && !show[key] ? '••••••••' : valor}
      </span>
      {secreta && (
        <button onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', padding: 4 }}>
          {show[key] ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
      <button onClick={() => copiar(valor, key)} aria-label="Copiar" style={{ border: '1px solid #E2E5EB', background: '#fff', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', flexShrink: 0 }}>
        {copied === key ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
      </button>
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,22,40,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#FFFFFF', borderRadius: '22px 22px 0 0', maxHeight: '82vh', overflowY: 'auto', padding: '8px 18px 28px' }}>
        <div style={{ width: 44, height: 5, borderRadius: 999, background: '#E2E5EB', margin: '10px auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>Tus accesos</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 38, height: 38, borderRadius: 999, border: 'none', background: '#F0F2F5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color="#6B7280" />
          </button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Las claves de tus plataformas, siempre a mano. Tocá el botón para copiar.</p>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 14, padding: '22px 10px' }}>Todavía no cargamos accesos acá.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((a, i) => (
              <div key={i} style={{ background: '#F7F8FA', border: '1px solid #E2E5EB', borderRadius: 16, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#1A1D26' }}>{a.label || 'Acceso'}</div>
                  {a.url && (
                    <a href={/^https?:\/\//.test(a.url) ? a.url : 'https://' + a.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#5B7CF5', textDecoration: 'none' }}>
                      Abrir <ExternalLink size={13} />
                    </a>
                  )}
                </div>
                {fila('Usuario', a.email, `u${i}`)}
                {fila('Contraseña', a.password, `p${i}`, true)}
                {a.notes && <div style={{ fontSize: 12.5, color: '#9CA3AF', paddingTop: 7, borderTop: '1px solid #F0F2F5' }}>{a.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const iconBtn = { width: 44, height: 44, borderRadius: 12, border: '1px solid #E2E5EB', background: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };

function TutorialesSheet({ onClose }) {
  const { data } = useAsync(() => api.tutoriales(), []);
  const items = data || [];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,22,40,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#FFFFFF', borderRadius: '22px 22px 0 0', maxHeight: '82vh', overflowY: 'auto', padding: '8px 18px 28px' }}>
        <div style={{ width: 44, height: 5, borderRadius: 999, background: '#E2E5EB', margin: '10px auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>Tutoriales</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 38, height: 38, borderRadius: 999, border: 'none', background: '#F0F2F5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color="#6B7280" />
          </button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Videos cortos para que grabes como un profesional. Tocá para ver.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((t) => (
            <a key={t.id} href={t.url || '#'} target={t.url ? '_blank' : undefined} rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14, background: '#F7F8FA', border: '1px solid #E2E5EB', borderRadius: 16, padding: 12, cursor: 'pointer' }}>
              <div style={{ width: 76, height: 60, borderRadius: 12, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Play size={26} color="#FFFFFF" fill="#FFFFFF" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D26', lineHeight: 1.3 }}>{t.titulo}</div>
                <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 3 }}>{t.dur}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const [tut, setTut] = useState(false);
  const [acc, setAcc] = useState(false);
  const { signOut } = usePortalAuth();
  const { data: me } = useAsync(() => api.me(), []);
  const clientName = me?.name || me?.clientName;

  return (
    <PhoneFrame>
      {/* Confirmar antes de salir: un toque de más no puede dejar afuera a una persona mayor. */}
      <Header clientName={clientName} onAccesos={() => setAcc(true)} onTutoriales={() => setTut(true)} onSignOut={() => { if (window.confirm('¿Querés cerrar sesión?')) signOut(); }} />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
        <div style={{ height: 12 }} />
      </main>
      {tut && <TutorialesSheet onClose={() => setTut(false)} />}
      {acc && <AccesosSheet onClose={() => setAcc(false)} />}
    </PhoneFrame>
  );
}

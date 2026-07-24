import { useState } from 'react';
import { ChevronRight, KeyRound, HelpCircle, LogOut } from 'lucide-react';
import { Screen, Card, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { usePortalAuth } from '../auth/PortalAuthProvider';
import { AccesosSheet, TutorialesSheet } from '../components/Layout';

// Tab Perfil: quién es, sus accesos, los tutoriales y cerrar sesión.
export default function PerfilScreen() {
  const { signOut, user } = usePortalAuth();
  const { data: me } = useAsync(() => api.me(), []);
  const [acc, setAcc] = useState(false);
  const [tut, setTut] = useState(false);

  const name = me?.name || me?.clientName || '';
  const iniciales = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';

  return (
    <Screen>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '0 0 16px', fontSize: 26, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.03em' }}>Perfil</h1>

      <Card style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 54, height: 54, borderRadius: 999, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 19, color: '#FFFFFF', letterSpacing: '-0.02em' }}>{iniciales}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.01em' }}>{name || '…'}</div>
          {user?.email && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>}
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginTop: 3 }}>Cliente Método Korex</div>
        </div>
      </Card>

      <Card style={{ padding: '4px 0', marginBottom: 20 }}>
        <Fila Icon={KeyRound} color="#B45309" bg="#FEF3C7" titulo="Tus accesos" sub="Las claves de tus plataformas, a mano" onClick={() => setAcc(true)} />
        <Fila Icon={HelpCircle} color="#5B7CF5" bg="#EEF2FF" titulo="Tutoriales" sub="Videos cortos para grabar como un pro" onClick={() => setTut(true)} borde />
      </Card>

      <Card onClick={() => { if (window.confirm('¿Quieres cerrar sesión?')) signOut(); }} style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <LogOut size={19} color="#DC2626" />
        </div>
        <span style={{ flex: 1, fontSize: 15.5, fontWeight: 700, color: '#DC2626' }}>Cerrar sesión</span>
      </Card>

      {acc && <AccesosSheet onClose={() => setAcc(false)} />}
      {tut && <TutorialesSheet onClose={() => setTut(false)} />}
    </Screen>
  );
}

function Fila({ Icon, color, bg, titulo, sub, onClick, borde }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', cursor: 'pointer', borderTop: borde ? '1px solid #F0F2F5' : 'none' }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={19} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: '#1A1D26' }}>{titulo}</div>
        <div style={{ fontSize: 12.5, color: '#9CA3AF', marginTop: 1 }}>{sub}</div>
      </div>
      <ChevronRight size={18} color="#C4C9D4" style={{ flexShrink: 0 }} />
    </div>
  );
}

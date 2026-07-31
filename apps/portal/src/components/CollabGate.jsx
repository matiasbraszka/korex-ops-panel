import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePortalAuth } from '../auth/PortalAuthProvider';
import PhoneFrame from './PhoneFrame';
import { Loading } from './ui';
import ColaboradorOnboarding from '../screens/ColaboradorOnboarding';

// Portón del portal: al entrar, si el usuario es un colaborador "Encargado de
// grabarse" que todavía no hizo su mini-onboarding de historia, lo obliga a
// hacerlo antes de ver nada. Para un cliente normal (o el resto de roles) pasa
// de largo al instante (una sola RPC liviana).
export default function CollabGate({ children }) {
  const { demo } = usePortalAuth();
  const [estado, setEstado] = useState(demo ? 'ok' : 'cargando'); // cargando | gate | ok
  const [yo, setYo] = useState(null);

  useEffect(() => {
    if (demo) { setEstado('ok'); return; }
    let vivo = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('portal_collab_yo');
        if (!vivo) return;
        if (data?.es_colaborador && data?.necesita_onboarding) { setYo(data); setEstado('gate'); }
        else setEstado('ok');
      } catch { if (vivo) setEstado('ok'); }
    })();
    return () => { vivo = false; };
  }, [demo]);

  if (estado === 'cargando') {
    return <PhoneFrame><div style={{ margin: 'auto' }}><Loading label="Abriendo tu espacio…" /></div></PhoneFrame>;
  }
  if (estado === 'gate') {
    return <ColaboradorOnboarding yo={yo} onDone={() => setEstado('ok')} />;
  }
  return children;
}

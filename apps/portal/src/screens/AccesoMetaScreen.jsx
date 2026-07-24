import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Copy, Check, Monitor, Video } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { useAsync } from '../components/ui';
import { api } from '../data/portalApi';
import { T, cardStyle, microLabel, bigBtn } from '../components/theme';

// ACCESO A META: el paso a paso para que el cliente nos dé acceso a su
// Business Manager, con el número de socio copiable y el botón
// "YA TE DI EL ACCESO" (avisa al equipo por Slack para validar).
export default function AccesoMetaScreen() {
  const nav = useNavigate();
  const { data, reload } = useAsync(() => api.meta(), []);
  const [copiado, setCopiado] = useState(false);
  const [marcando, setMarcando] = useState(false);

  const partner = data?.partnerId || '';
  const estado = data?.estado || 'pendiente';
  const wa = (data?.whatsapp || '').replace(/\D/g, '');

  const copiar = async () => { try { await navigator.clipboard.writeText(partner.replace(/\s/g, '')); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* */ } };
  const yaLoDi = async () => {
    setMarcando(true);
    try { await api.marcarAccesoMeta(); await reload?.(); } finally { setMarcando(false); }
  };

  return (
    <PhoneFrame>
      <div style={{ position: 'sticky', top: 0, background: T.bg, padding: '14px 20px 8px', zIndex: 10 }}>
        <button onClick={() => nav(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: T.primary, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', padding: '6px 0' }}>
          <ChevronLeft size={17} /> Volver
        </button>
      </div>
      <div style={{ padding: '4px 20px 28px', overflowY: 'auto', background: T.bg, flex: 1 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 25, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em' }}>Danos acceso a tu Meta</h1>
        <p style={{ margin: '0 0 18px', fontSize: 14.5, color: T.text2, lineHeight: 1.5 }}>
          Es lo único que no podemos hacer por ti. Son 3 pasos desde la computadora y tarda 4 minutos.
        </p>

        <Paso n={1} titulo="Entra a business.facebook.com" sub="Inicia sesión con la cuenta que usas para tu página." />
        <Paso n={2} titulo="Configuración › Socios › Agregar" sub="Dentro de Configuración del negocio, sección Socios." />

        {/* Paso 3: el número de socio */}
        <div style={{ ...cardStyle, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <NumChip n={3} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: T.ink, lineHeight: 1.3 }}>Pega nuestro número de socio</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                <span style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: partner ? 18 : 13, fontWeight: 800, color: partner ? T.ink : T.text3, letterSpacing: '0.04em', background: '#F4F5F9', borderRadius: 10, padding: '10px 12px' }}>
                  {partner || 'Te lo pasamos por WhatsApp'}
                </span>
                {partner && (
                  <button onClick={copiar} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${T.border}`, background: '#fff', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, fontWeight: 800, color: copiado ? T.green : T.primary, cursor: 'pointer' }}>
                    {copiado ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}{copiado ? 'Copiado' : 'Copiar'}
                  </button>
                )}
              </div>
              <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.45 }}>Elige el rol <b>Administrar campañas</b> y confirma.</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16, fontSize: 13, color: T.text2, lineHeight: 1.45 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Video size={16} color={T.primary} /></span>
          <span>¿Se te complica? Lo hacemos juntos por videollamada de 10 minutos.{' '}
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Escríbenos</a>}
          </span>
        </div>

        {estado === 'validado' ? (
          <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 10, background: T.greenSoft, border: '1px solid #BBE9CD' }}>
            <Check size={19} color={T.green} strokeWidth={3} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: '#116A34' }}>Acceso confirmado. ¡Gracias!</span>
          </div>
        ) : estado === 'cliente_dice_listo' ? (
          <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 10, background: T.primarySoft, border: '1px solid #D5D9FC' }}>
            <Check size={19} color={T.primary} strokeWidth={3} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: T.primary }}>Nos avisaste que ya está. Lo estamos validando.</span>
          </div>
        ) : (
          <button onClick={yaLoDi} disabled={marcando} style={{ ...bigBtn(T.green), opacity: marcando ? 0.7 : 1 }}>
            {marcando ? 'Avisando…' : 'Ya te di el acceso'} <Check size={16} strokeWidth={3} />
          </button>
        )}
      </div>
    </PhoneFrame>
  );
}

function NumChip({ n }) {
  return (
    <span style={{ width: 34, height: 34, borderRadius: 999, background: T.primarySoft, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 800, flexShrink: 0 }}>{n}</span>
  );
}

function Paso({ n, titulo, sub }) {
  return (
    <div style={{ ...cardStyle, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <NumChip n={n} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: T.ink, lineHeight: 1.3 }}>{titulo}</div>
          <div style={{ margin: '10px 0', height: 84, borderRadius: 12, background: '#EDEFF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 5 }}>
            <Monitor size={20} color="#B9C0CC" />
            <span style={microLabel('#B9C0CC')}>Captura</span>
          </div>
          <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.45 }}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

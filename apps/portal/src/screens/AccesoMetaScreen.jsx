import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import { useAsync } from '../components/ui';
import { api } from '../data/portalApi';
import { T, display } from '../components/theme';
import { IcoChevL, IcoCheck, IcoCopy, IcoInfo } from '../components/icons';

// ACCESO A META — exacta al prototipo: 3 pasos con captura, el número de socio
// copiable y el botón "Ya te di el acceso" (avisa al equipo por Slack).
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

  const numChip = (n) => (
    <span style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
  );
  const captura = (
    <div style={{ height: 104, borderRadius: 14, background: 'linear-gradient(160deg,#E9EDF4,#D9DFE9)', display: 'flex', alignItems: 'flex-end', padding: 10, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.text2 }}>Captura</div>
  );

  return (
    <PhoneFrame>
      <KxScreen>
        <div className="kxs" style={{ flex: 1, overflowY: 'auto' }}>
          <div onClick={() => nav(-1)} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 0', color: T.primary, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <IcoChevL size={17} stroke="var(--mk-blue-ops)" sw={2.4} />
            Volver
          </div>

          <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ ...display(29, '-0.035em'), textWrap: 'balance' }}>Danos acceso a tu Meta</div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: T.textSoft, textWrap: 'pretty' }}>
              Es lo único que no podemos hacer por ti. Son 3 pasos desde la computadora y tarda 4 minutos.
            </div>
          </div>

          <div style={{ padding: '22px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={cardPaso}>
              <div style={pasoHead}>{numChip(1)}<span style={pasoTitulo}>Entra a business.facebook.com</span></div>
              {captura}
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: T.text2 }}>Inicia sesión con la cuenta que usas para tu página.</div>
            </div>

            <div style={cardPaso}>
              <div style={pasoHead}>{numChip(2)}<span style={pasoTitulo}>Configuración › Socios › Agregar</span></div>
              {captura}
            </div>

            <div style={cardPaso}>
              <div style={pasoHead}>{numChip(3)}<span style={pasoTitulo}>Pega nuestro número de socio</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: 'var(--mk-blue-bg2)', border: '1px dashed #C3CFEF' }}>
                <span style={{ flex: 1, fontFamily: "'Montserrat', sans-serif", fontSize: partner ? 19 : 13.5, fontWeight: 800, letterSpacing: '0.02em', color: partner ? T.primaryInk : T.text3 }}>
                  {partner || 'Te lo pasamos por WhatsApp'}
                </span>
                {partner && (
                  <span onClick={copiar} role="button" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px', borderRadius: 999, background: '#fff', border: '1px solid var(--mk-border)', fontSize: 12, fontWeight: 700, color: copiado ? 'var(--mk-green)' : T.textSoft }}>
                    {copiado ? <IcoCheck size={14} stroke="var(--mk-green)" sw={2.6} /> : <IcoCopy size={14} stroke="currentColor" sw={2} />}
                    {copiado ? 'Copiado' : 'Copiar'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: T.text2 }}>Elige el rol <b style={{ color: T.textSoft }}>Administrar campañas</b> y confirma.</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 17px', borderRadius: 16, background: T.surface2 }}>
              <IcoInfo size={18} stroke="var(--mk-text2)" sw={2.1} />
              <span style={{ fontSize: 13, lineHeight: 1.45, color: T.textSoft }}>
                ¿Se te complica? Lo hacemos juntos por videollamada de 10 minutos.{' '}
                {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Escríbenos</a>}
              </span>
            </div>
          </div>
          <div style={{ height: 26 }} />
        </div>

        {/* Footer fijo */}
        <div data-kx-footer="" style={{ flex: 'none', padding: '16px 22px 28px', background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(10px)', boxShadow: '0 -1px 0 var(--mk-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {estado === 'validado' ? (
            <div onClick={() => nav('/')} role="button" style={{ cursor: 'pointer', height: 52, borderRadius: 999, background: 'var(--mk-green-bg)', color: T.textSoft, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <IcoCheck size={18} stroke="var(--mk-green)" sw={2.6} />
              Acceso confirmado
            </div>
          ) : estado === 'cliente_dice_listo' ? (
            <div style={{ height: 52, borderRadius: 999, background: 'var(--mk-blue-bg)', color: T.primary, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <IcoCheck size={18} stroke="var(--mk-blue-ops)" sw={2.6} />
              Nos avisaste — lo estamos validando
            </div>
          ) : (
            <div onClick={marcando ? undefined : yaLoDi} role="button" style={{ cursor: 'pointer', height: 52, borderRadius: 999, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: marcando ? 0.7 : 1 }}>
              {marcando ? 'Avisando…' : 'Ya te di el acceso'}
            </div>
          )}
        </div>
      </KxScreen>
    </PhoneFrame>
  );
}

const cardPaso = { background: '#fff', borderRadius: 20, padding: 18, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 12 };
const pasoHead = { display: 'flex', alignItems: 'center', gap: 11 };
const pasoTitulo = { fontSize: 16, fontWeight: 800, color: 'var(--mk-ink)' };

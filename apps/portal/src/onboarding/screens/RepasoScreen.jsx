// Repaso final.
//
// Acá vuelven las respuestas que el cliente pasó de largo con "igual quiero
// seguir". No es un castigo: en la segunda pasada ya agarró ritmo y con el
// micrófono a mano recupera la mayoría. Por eso el bloque se llama "podemos
// mejorar" y no "te faltan".
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, display, bigBtn, microLabel, pill } from '../../components/theme';
import { IcoCheck, IcoArrowR, IcoWarn, IcoUpload, IcoChevR } from '../../components/icons';
import { Spinner } from '../../components/ui';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { onb } from '../api';

export default function RepasoScreen() {
  const navigate = useNavigate();
  const { secciones, respuestas, bloqueantes, progreso, cortas, flush, setEstado } = useOnboarding();
  const [cerrando, setCerrando] = useState(false);
  const [faltan, setFaltan] = useState(null);
  const [error, setError] = useState('');

  const bloqPend = (bloqueantes || []).filter(
    (b) => Number(b.subidos || 0) < Math.max(Number(b.target || 1), 1),
  );

  const terminar = async () => {
    setCerrando(true); setError(''); setFaltan(null);
    await flush();
    try {
      const r = await onb.completar();
      if (r?.ok) {
        setEstado((e) => (e ? { ...e, estado: 'completado' } : e));
        navigate('/onboarding/listo', { replace: true });
        return;
      }
      if (r?.error === 'faltan') { setFaltan(r.faltan || []); return; }
      setError('No pudimos cerrar tu onboarding. Probá de nuevo en un momento.');
    } catch {
      setError('No pudimos cerrar tu onboarding. Revisá tu conexión y probá de nuevo.');
    } finally {
      setCerrando(false);
    }
  };

  const irA = (qkey) => {
    const s = secciones.find((x) => (x.preguntas || []).some((q) => q.qkey === qkey));
    if (s) navigate(`/onboarding/${s.skey}/${qkey}`);
  };

  const listo = progreso.pct >= 100;

  return (
    <OnbShell>
      <OnbHeader titulo="Repaso final" onVolver={() => navigate('/onboarding')} />

      <div className="kxs" style={{ flex: 1, paddingTop: 24, paddingBottom: 28 }}>
        <div style={{ ...display(28, '-0.033em'), lineHeight: 1.15 }}>
          {listo ? 'Está todo listo' : 'Casi terminás'}
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.55, color: T.text2, marginTop: 11 }}>
          {listo
            ? 'Repasá si querés mejorar alguna respuesta y cerramos.'
            : 'Te falta poco. Esto es lo que necesitamos para arrancar.'}
        </div>

        {/* Material bloqueante */}
        {bloqPend.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ ...microLabel(T.orange), marginBottom: 10 }}>
              Sin esto no podemos empezar
            </div>
            <div style={{ background: '#fff', borderRadius: 18, boxShadow: 'var(--shadow-md)', padding: '4px 4px' }}>
              {bloqPend.map((b, i) => (
                <Fila
                  key={b.tipo} borde={i > 0}
                  icono={<IcoUpload size={17} stroke={T.orange} />}
                  titulo={b.titulo}
                  detalle={b.target ? `${b.subidos || 0} de ${b.target}` : 'Falta'}
                  color={T.orange}
                  onClick={() => {
                    const s = secciones.find((x) => (x.preguntas || []).some((q) => q.bucket === b.bucket));
                    const q = s?.preguntas?.find((x) => x.bucket === b.bucket);
                    if (s && q) navigate(`/onboarding/${s.skey}/${q.qkey}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Respuestas cortas */}
        {cortas.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ ...microLabel(), marginBottom: 4 }}>
              {cortas.length} {cortas.length === 1 ? 'respuesta que podemos mejorar' : 'respuestas que podemos mejorar'}
            </div>
            <div style={{ fontSize: 14, color: T.text2, marginBottom: 10, lineHeight: 1.5 }}>
              Con un poco más de detalle, lo que escribamos te va a salir mucho mejor.
              Tocá una y contala hablando: son menos de dos minutos.
            </div>
            <div style={{ background: '#fff', borderRadius: 18, boxShadow: 'var(--shadow-md)', padding: '4px 4px' }}>
              {cortas.map((q, i) => {
                const len = String(respuestas[q.qkey]?.valor || '').trim().length;
                return (
                  <Fila
                    key={q.qkey} borde={i > 0}
                    icono={<span style={{ fontSize: 12, fontWeight: 800, color: T.text3 }}>{i + 1}</span>}
                    titulo={q.label}
                    detalle={`${Math.round((len / q.minChars) * 100)}%`}
                    onClick={() => irA(q.qkey)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Lo que sí está */}
        <div style={{
          marginTop: 26, padding: '16px 17px', borderRadius: 18,
          background: T.greenSoft, display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <IcoCheck size={19} stroke={T.green} sw={2.5} style={{ flex: 'none', marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: '#166534' }}>
              {progreso.respondidas} de {progreso.requeridas} respuestas completas
            </div>
            <div style={{ fontSize: 14.5, color: '#15803D', marginTop: 3, lineHeight: 1.5 }}>
              Todo guardado. No se pierde nada aunque cierres.
            </div>
          </div>
        </div>

        {faltan && faltan.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ ...microLabel(T.red), marginBottom: 10 }}>Todavía falta esto</div>
            <div style={{ background: '#fff', borderRadius: 18, boxShadow: 'var(--shadow-md)', padding: '4px 4px' }}>
              {faltan.map((f, i) => (
                <Fila
                  key={f.qkey} borde={i > 0}
                  icono={<IcoWarn size={17} stroke={T.red} />}
                  titulo={f.label} detalle={f.seccion} color={T.red}
                  onClick={() => irA(f.qkey)}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 18, padding: '12px 14px', borderRadius: 13, background: T.redSoft,
            fontSize: 14.5, lineHeight: 1.55, color: '#991B1B',
          }}>{error}</div>
        )}
      </div>

      <OnbFooter>
        <button
          type="button" onClick={terminar} disabled={cerrando}
          style={{ ...bigBtn(listo ? T.green : T.primary, 52), opacity: cerrando ? 0.6 : 1 }}
        >
          {cerrando ? <Spinner size={18} color="#fff" /> : <IcoCheck size={18} stroke="#fff" sw={2.5} />}
          {cerrando ? 'CERRANDO…' : 'TERMINAR MI ONBOARDING'}
        </button>
        {!listo && (
          <div style={{ fontSize: 13.5, color: T.text3, textAlign: 'center', marginTop: 9, lineHeight: 1.45 }}>
            Te falta {100 - progreso.pct}% para poder cerrarlo.
          </div>
        )}
      </OnbFooter>
    </OnbShell>
  );
}

function Fila({ icono, titulo, detalle, color, onClick, borde }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
      padding: '14px 13px', background: 'none', border: 'none', cursor: 'pointer',
      borderTop: borde ? '1px solid #EEF0F4' : 'none',
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: 9, background: T.surface2, flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icono}</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 15, color: T.text, lineHeight: 1.4,
      }}>{titulo}</span>
      {detalle && <span style={pill(T.surface2, color || T.text2)}>{detalle}</span>}
      <IcoChevR size={16} stroke={T.text3} style={{ flex: 'none' }} />
    </button>
  );
}

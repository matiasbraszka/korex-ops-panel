import { useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import PhoneFrame from '../components/PhoneFrame';
import { Spinner } from '../components/ui';
import { IcoArrowR } from '../components/icons';
import { T, microLabel } from '../components/theme';
import logo from '../assets/logo-korex.svg';

// MINI-ONBOARDING DE HISTORIA — obligatorio para el colaborador "Encargado de
// grabarse". Sus respuestas se guardan como una sección "Onboarding de {nombre}"
// en el DEL del cliente. Al terminar ve el video de la plataforma y entra.
// Redacción en español neutro.
const PREGUNTAS = [
  { key: 'instagram',   grupo: 'Tu historia de vida', label: 'Tu Instagram', tipo: 'texto', ph: '@tuusuario' },
  { key: 'antes',       grupo: 'Tu historia de vida', label: '¿A qué te dedicabas antes de este negocio? ¿De dónde vienes?', tipo: 'largo', ej: 'Trabajé 14 años como enfermera en un hospital público…' },
  { key: 'cuando',      grupo: 'Tu historia de vida', label: '¿Hace cuánto iniciaste en el negocio que haces hoy?', tipo: 'texto', ph: 'Ej.: hace 3 años' },
  { key: 'porque',      grupo: 'Tu historia de vida', label: '¿Por qué empezaste? Cuenta tu dolor, tu botón caliente — con contexto real.', tipo: 'largo' },
  { key: 'res_dinero',  grupo: 'Tu historia de vida', label: '¿Qué resultados de dinero y materiales has logrado?', tipo: 'largo' },
  { key: 'res_no',      grupo: 'Tu historia de vida', label: '¿Qué resultados NO materiales has logrado?', tipo: 'largo' },
  { key: 'estilo',      grupo: 'Tu historia de vida', label: '¿Qué estilo de vida te permitió? Cuenta una anécdota.', tipo: 'largo' },
  { key: 'red',         grupo: 'Tu historia de vida', label: '¿Cuántas personas tienes en tu red?', tipo: 'texto' },
  { key: 'diferencial', grupo: 'Tu historia de vida', label: '¿Puntos diferenciales frente a otras oportunidades similares?', tipo: 'largo' },
  { key: 'edad',        grupo: 'Tu historia de vida', label: '¿Qué edad tienes?', tipo: 'texto' },
  { key: 'explica',     grupo: 'Tu historia de vida', label: '¿Cómo le explicas a alguien, en breve, el negocio que haces?', tipo: 'largo' },
  { key: 'testimonio',  grupo: 'Tu historia de vida', label: '¿Cuál es tu testimonio o experiencia de cambio de vida con el producto de la empresa?', tipo: 'largo' },
  { key: 'algo_mas',    grupo: 'Tu historia de vida', label: '¿Algo más que quieras que sepamos?', tipo: 'largo', opcional: true },
  { key: 'aut_hitos',   grupo: 'Tu autoridad', label: 'Hitos, premios, entrevistas, conferencias', tipo: 'largo', opcional: true, ej: 'Rango diamante desde 2023; premio al mejor equipo del país 2024…' },
  { key: 'aut_medios',  grupo: 'Tu autoridad', label: 'Apariciones en medios, podcasts, eventos', tipo: 'largo', opcional: true },
  { key: 'aut_recon',   grupo: 'Tu autoridad', label: 'Reconocimientos en la empresa o industria', tipo: 'largo', opcional: true },
];

export default function ColaboradorOnboarding({ yo, onDone }) {
  const [ans, setAns] = useState(() => yo?.respuestas || {});
  const [fase, setFase] = useState('form'); // form | listo
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [video, setVideo] = useState(yo?.video || '');
  const [vio, setVio] = useState(false);
  const guardadoRef = useRef(null);

  const requeridas = useMemo(() => PREGUNTAS.filter((p) => !p.opcional), []);
  const hechas = requeridas.filter((p) => (ans[p.key] || '').trim()).length;
  const faltan = requeridas.length - hechas;

  const set = (k) => (e) => setAns((p) => ({ ...p, [k]: e.target.value }));
  // Autoguardado al salir del campo (por si cierra sin terminar).
  const guardar = () => {
    clearTimeout(guardadoRef.current);
    guardadoRef.current = setTimeout(() => { supabase.rpc('portal_collab_onb_guardar', { p_answers: ans }); }, 400);
  };

  const terminar = async () => {
    if (faltan > 0) { setMsg(`Te faltan ${faltan} respuesta${faltan > 1 ? 's' : ''} para terminar.`); return; }
    setBusy(true); setMsg(null);
    const pares = PREGUNTAS.map((p) => ({ grupo: p.grupo, q: p.label, a: (ans[p.key] || '').trim() }));
    try {
      const { data, error } = await supabase.rpc('portal_collab_onb_completar', { p_answers: ans, p_pares: pares, p_titulo: null });
      if (error || !data?.ok) { setMsg('No pudimos guardar. Prueba de nuevo.'); return; }
      if (data.video) setVideo(data.video);
      setFase('listo');
      window.scrollTo?.(0, 0);
    } catch { setMsg('No pudimos guardar. Prueba de nuevo.'); }
    finally { setBusy(false); }
  };

  // ── Pantalla final: video + entrar ──
  if (fase === 'listo') {
    return (
      <PhoneFrame>
        <div className="kxs" style={wrap}>
          <div style={{ ...inner, justifyContent: 'center', gap: 22 }}>
            <img src={logo} alt="Método Korex" style={{ height: 40, alignSelf: 'flex-start' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-.032em', lineHeight: 1.14, color: T.ink }}>
                ¡Listo! Ya sos parte del equipo
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.55, color: T.text2 }}>
                Guardamos tu historia. Antes de entrar, mira este video corto para saber cómo usar la plataforma.
              </div>
            </div>

            {video ? (
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 18, overflow: 'hidden', background: '#0d1117', boxShadow: '0 12px 32px rgba(10,22,40,.16)' }}>
                {vio ? (
                  <iframe src={video} title="Cómo usar la plataforma" allowFullScreen style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
                ) : (
                  <button type="button" onClick={() => setVio(true)} style={{ position: 'absolute', inset: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 72, height: 72, borderRadius: '50%', background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(91,124,245,.45)' }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </button>
                )}
              </div>
            ) : null}

            <button onClick={onDone} style={{ ...btnPrimary, marginTop: 4 }}>
              Entrar a la plataforma<IcoArrowR size={17} stroke="#fff" sw={2.4} />
            </button>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  // ── Formulario ──
  let grupoActual = '';
  return (
    <PhoneFrame>
      <div className="kxs" style={wrap}>
        <div style={inner}>
          <img src={logo} alt="Método Korex" style={{ height: 38, alignSelf: 'flex-start' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.15, color: T.ink }}>
              {yo?.nombre ? `${yo.nombre.split(' ')[0]}, contanos tu historia` : 'Contanos tu historia'}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: T.text2, textWrap: 'pretty' }}>
              Con esto escribimos tus anuncios y tu mensaje. Cuanto más real y detallado, mejor sale. Es un solo paso.
            </div>
          </div>

          {/* Progreso */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'sticky', top: 0, background: 'var(--mk-blue-bg2)', paddingBottom: 6, zIndex: 2 }}>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--mk-border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((hechas / requeridas.length) * 100)}%`, background: T.primary, borderRadius: 999, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>{hechas} de {requeridas.length} respondidas</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PREGUNTAS.map((p) => {
              const nuevoGrupo = p.grupo !== grupoActual;
              grupoActual = p.grupo;
              return (
                <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {nuevoGrupo && (
                    <div style={{ ...microLabel(), letterSpacing: '.1em', fontSize: 12.5, fontWeight: 800, color: T.primary, marginTop: 10 }}>
                      {p.grupo === 'Tu autoridad' ? '🏆 ' : '🧬 '}{p.grupo}{p.grupo === 'Tu autoridad' ? ' · opcional' : ''}
                    </div>
                  )}
                  <label style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, lineHeight: 1.4 }}>
                    {p.label}{p.opcional && <span style={{ color: T.text3, fontWeight: 600 }}> (opcional)</span>}
                  </label>
                  {p.tipo === 'texto' ? (
                    <input value={ans[p.key] || ''} onChange={set(p.key)} onBlur={guardar} placeholder={p.ph || ''} style={inp} />
                  ) : (
                    <textarea value={ans[p.key] || ''} onChange={set(p.key)} onBlur={guardar} placeholder={p.ej ? `Ej.: ${p.ej}` : 'Escribe con tus palabras…'} rows={4} style={{ ...inp, height: 'auto', minHeight: 92, padding: '12px 16px', lineHeight: 1.5, resize: 'vertical' }} />
                  )}
                </div>
              );
            })}
          </div>

          {msg && <div style={{ fontSize: 14, fontWeight: 600, padding: '10px 14px', borderRadius: 12, background: 'var(--mk-red-bg)', color: 'var(--mk-red)' }}>{msg}</div>}

          <button onClick={terminar} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.75 : 1 }}>
            {busy ? <Spinner size={20} color="#fff" /> : <>Terminar y entrar<IcoArrowR size={17} stroke="#fff" sw={2.4} /></>}
          </button>
          <div style={{ height: 20 }} />
        </div>
      </div>
    </PhoneFrame>
  );
}

const wrap = { height: '100%', boxSizing: 'border-box', background: 'linear-gradient(180deg, var(--mk-blue-bg2) 0%, #fff 40%)', padding: '0 24px', display: 'flex', flexDirection: 'column', overflowY: 'auto', animation: 'kxFade .3s ease' };
const inner = { flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding: '32px 0 40px' };
const inp = { height: 50, borderRadius: 13, border: '1px solid var(--mk-border)', boxShadow: 'var(--shadow-sm)', padding: '0 16px', fontSize: 15, fontFamily: 'inherit', color: 'var(--mk-text)', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' };
const btnPrimary = { cursor: 'pointer', height: 54, border: 'none', borderRadius: 999, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 22px rgba(91,124,245,.34)' };

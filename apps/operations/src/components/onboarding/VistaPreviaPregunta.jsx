/**
 * Cómo ve el cliente la pregunta que se está editando.
 *
 * Existe por una razón concreta: el campo de mayor impacto del onboarding es el
 * EJEMPLO —es la vara contra la que el cliente calibra cuánto escribir— y
 * editarlo a ciegas, en un textarea del panel, no deja ver si quedó del largo
 * que corresponde. Acá se ve con la tipografía, el ancho y el medidor reales.
 *
 * Es una réplica deliberada de los estilos del portal, no un import: son dos
 * aplicaciones distintas del monorepo y compartir componentes entre ellas
 * obligaría a sacar el design system del onboarding a un paquete, que es mucho
 * más de lo que este panel necesita.
 */

const T = {
  ink: '#1A1D26', soft: '#3F4653', muted: '#6B7280', faint: '#9CA3AF',
  line: '#E2E5EB', lineFuerte: '#D0D5DD', azul: '#5B7CF5', azulTinta: '#4A67D8',
  azulWash: '#EEF2FF', azulWash2: '#F5F7FF', azulLinea: '#DDE4FF',
  bg: '#F7F8FA', dark: '#0D1117', verde: '#22C55E', ambar: '#EAB308',
};
const DISPLAY = "'Montserrat', sans-serif";

/** El mismo cálculo que progreso.js y que _onboarding_lleno() en SQL. */
function medidor(len, largo) {
  const min = Math.round(largo * 0.6);
  const r = largo ? len / largo : 0;
  if (len === 0) return { w: '0%', color: T.lineFuerte, texto: `Mínimo ${min} caracteres` };
  if (len < min) return { w: `${Math.min(100, r * 100)}%`, color: T.ambar, texto: `Faltan ${min - len} caracteres` };
  if (r < 1) return { w: `${r * 100}%`, color: T.verde, texto: 'Muy buena respuesta' };
  return { w: '100%', color: T.verde, texto: 'Excelente' };
}

export default function VistaPreviaPregunta({ q }) {
  const opciones = Array.isArray(q.opciones) ? q.opciones : [];
  const chips = Array.isArray(q.chips) ? q.chips : [];
  // Se mide el ejemplo: es exactamente lo que queremos saber al editarlo.
  const m = q.largo_objetivo ? medidor((q.ejemplo || '').trim().length, q.largo_objetivo) : null;

  return (
    <div style={{
      background: T.bg, border: `1px solid ${T.line}`, borderRadius: 14,
      padding: 22, fontFamily: "'Inter', -apple-system, sans-serif", color: T.ink,
    }}>
      {q.qtype === 'info' ? (
        <div style={{ borderRadius: 16, background: T.dark, padding: '20px 22px' }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em',
            textTransform: 'uppercase', color: '#7B9AFF', marginBottom: 8,
          }}>{q.info_kicker}</div>
          <div style={{
            fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: '#fff',
            letterSpacing: '-.02em', lineHeight: 1.3, marginBottom: 10,
          }}>{q.info_titulo}</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: T.faint }}>{q.info_cuerpo}</div>
        </div>
      ) : (
        <>
          {q.cabecera && (
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 18, marginBottom: 14 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>
                {q.cabecera}
              </div>
              {q.cabecera_sub && (
                <div style={{ fontSize: 13, color: T.muted, marginTop: 5 }}>{q.cabecera_sub}</div>
              )}
            </div>
          )}

          <div style={{
            fontFamily: DISPLAY, fontSize: 22, fontWeight: 800,
            letterSpacing: '-.024em', lineHeight: 1.24, color: '#0A0A0A',
          }}>
            {q.label || <span style={{ color: T.faint }}>(sin pregunta)</span>}
            {!q.requerida && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
                color: T.faint, marginLeft: 10, fontFamily: 'inherit',
              }}>Opcional</span>
            )}
          </div>
          {q.sublabel && (
            <div style={{ fontSize: 13, color: T.muted, marginTop: 7, lineHeight: 1.5 }}>{q.sublabel}</div>
          )}

          {chips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {chips.map((c) => (
                <span key={c} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, background: T.azulWash2,
                  border: `1px solid ${T.azulLinea}`, borderRadius: 999, padding: '8px 13px',
                  fontSize: 12.5, fontWeight: 600, color: T.azulTinta,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.azul }} />
                  {c}
                </span>
              ))}
            </div>
          )}

          {q.ejemplo && q.largo_objetivo > 0 && (
            <div style={{
              marginTop: 14, border: `1px solid ${T.line}`, borderRadius: 14,
              background: '#fff', padding: '14px 16px',
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.soft, marginBottom: 10 }}>
                Ver un ejemplo bien contestado
              </div>
              <div style={{
                background: T.bg, borderLeft: `3px solid ${T.azul}`, borderRadius: '0 10px 10px 0',
                padding: '14px 15px', fontSize: 13.5, lineHeight: 1.65, color: T.soft,
                whiteSpace: 'pre-line',
              }}>{q.ejemplo}</div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            {(q.qtype === 'opciones' || q.qtype === 'si_no') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {opciones.map((o) => (
                  <div key={o.value} style={{
                    borderRadius: 14, padding: '15px 16px', display: 'flex',
                    alignItems: 'center', gap: 13, border: `1.5px solid ${T.line}`, background: '#fff',
                  }}>
                    <div style={{
                      width: 21, height: 21, flex: '0 0 21px', borderRadius: '50%',
                      border: `2px solid ${T.lineFuerte}`, background: '#fff',
                    }} />
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: T.ink }}>{o.label}</div>
                      {o.hint && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>{o.hint}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {q.qtype === 'chips_multi' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                {opciones.map((o) => (
                  <span key={o.value} style={{
                    borderRadius: 999, padding: '12px 17px', fontSize: 13.5, fontWeight: 600,
                    border: `1.5px solid ${T.line}`, background: '#fff', color: T.soft,
                  }}>{o.label}</span>
                ))}
              </div>
            )}

            {(q.qtype === 'abierta') && (
              <div style={{ position: 'relative' }}>
                <div style={{
                  border: `1px solid ${T.lineFuerte}`, borderRadius: 16, background: '#fff',
                  padding: '15px 17px', minHeight: q.min_altura || 120,
                  paddingBottom: q.largo_objetivo ? 62 : 15,
                  fontSize: 15, lineHeight: 1.6, color: T.faint,
                }}>{q.placeholder || 'Escribí acá tu respuesta…'}</div>
                {q.largo_objetivo > 0 && (
                  <div style={{
                    position: 'absolute', left: 12, right: 12, bottom: 12, borderRadius: 12,
                    background: T.azul, color: '#fff', padding: '11px 14px',
                    display: 'flex', alignItems: 'center', gap: 11,
                  }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                    }}>◉</span>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800 }}>Contéstalo hablando</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.75)' }}>
                      unos {Math.round(q.largo_objetivo / 14)} s
                    </span>
                  </div>
                )}
              </div>
            )}

            {q.qtype === 'corta' && (
              <div style={{
                border: `1px solid ${T.lineFuerte}`, borderRadius: 14, background: '#fff',
                padding: '15px 17px', fontSize: 16, color: T.faint,
              }}>{q.placeholder || ' '}</div>
            )}

            {(q.qtype === 'archivos' || q.qtype === 'subida') && (
              <div style={{
                border: `1.5px dashed ${T.lineFuerte}`, borderRadius: 18, background: '#fff',
                padding: '30px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{q.archivo_cta || 'Subí tus archivos'}</div>
                <div style={{ fontSize: 12.5, color: T.faint, marginTop: 6 }}>{q.archivo_hint}</div>
              </div>
            )}
          </div>

          {m && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, width: m.w, background: m.color }} />
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: m.color }}>{m.texto}</div>
            </div>
          )}
          {m && (
            <div style={{ fontSize: 11, color: T.faint, marginTop: 6 }}>
              El medidor está midiendo el EJEMPLO, para que veas si da el largo que pedís.
            </div>
          )}
        </>
      )}
    </div>
  );
}

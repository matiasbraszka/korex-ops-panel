// Visor de las "Reglas del servicio". Es un bottom sheet (mismo molde que
// CandadoSheet) con el documento adentro, scrolleable. Se usa en tres lugares:
// al inicio del onboarding, con acceso a mano durante todo el flujo, y desde el
// perfil una vez terminado. Solo LEE: el "leí y acepto" vive afuera, en la
// pantalla de bienvenida.
import { useState } from 'react';
import { limpiarHtml } from '../../components/richHtml';
import { IcoDoc, IcoX, IcoPlay } from '../../components/icons';
import { T, FUENTE } from '../tokens';
import { urlEmbed } from '../videoEmbed';

export default function ReglasSheet({ html, video, onCerrar }) {
  const cuerpo = String(html || '').trim();
  const vid = String(video || '').trim();
  const [vio, setVio] = useState(false);

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,22,40,.45)', zIndex: 80,
        display: 'flex', alignItems: 'flex-end', animation: 'kxFade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mk-sheet"
        style={{
          background: '#fff', borderRadius: '22px 22px 0 0',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          animation: 'kxUp .26s ease', overflow: 'hidden',
        }}
      >
        {/* Cabecera fija */}
        <div style={{ padding: '10px 22px 14px', borderBottom: `1px solid ${T.fill}` }}>
          <div style={{ width: 46, height: 5, borderRadius: 999, background: T.lineFuerte, margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 13, background: T.azulWash,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <IcoDoc size={21} stroke={T.azulTinta} sw={2.1} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FUENTE.display, fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>
                Reglas del servicio
              </div>
              <div style={{ fontSize: 12.5, color: T.muted }}>Cómo trabajamos juntos</div>
            </div>
            <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{
              width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.line}`,
              background: '#fff', color: T.muted, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IcoX size={17} stroke={T.muted} sw={2.2} />
            </button>
          </div>
        </div>

        {/* Documento scrolleable (con el video de bienvenida arriba, si hay) */}
        <div style={{ overflowY: 'auto', padding: '20px 22px 28px' }}>
          {vid && (
            <div style={{
              position: 'relative', width: '100%', aspectRatio: '16/9',
              borderRadius: 14, overflow: 'hidden', background: T.dark, marginBottom: 20,
            }}>
              {vio
                ? <iframe src={urlEmbed(vid)} title="Video de bienvenida" allowFullScreen
                    style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
                : (
                  <button type="button" onClick={() => setVio(true)} style={{
                    position: 'absolute', inset: 0, width: '100%', border: 'none', background: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{
                      width: 58, height: 58, borderRadius: '50%', background: T.azulMarca,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 8px 24px rgba(72,120,255,.42)',
                    }}>
                      <IcoPlay size={24} fill="#fff" stroke="none" />
                    </span>
                  </button>
                )}
            </div>
          )}
          {cuerpo
            ? <div className="kx-rich" dangerouslySetInnerHTML={{ __html: limpiarHtml(cuerpo) }} />
            : (
              <div style={{ textAlign: 'center', color: T.muted, fontSize: 14, padding: '30px 0' }}>
                Todavía no se cargaron las reglas del servicio.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

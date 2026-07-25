// ─────────────────────────────────────────────────────────────────────────────
// Subida de material.
//
// Va en el ÚLTIMO tramo, igual que en el documento de onboarding original
// ("8. Necesitamos del cliente"): primero se recolecta toda la información que
// solo el cliente tiene en la cabeza, y recién al final los archivos.
//
// Que esté al final no puede volver a producir la falla de siempre — que el
// cliente no suba nada. Lo que lo evita es que la lista de material aparece en
// la BIENVENIDA, antes de la primera pregunta: el cliente sabe desde el minuto
// cero que va a necesitar el logo, las fotos y los testimonios, y los junta
// mientras contesta. Cuando llega acá ya los tiene a mano.
//
// Y la subida sigue corriendo en background mientras navega: el estado vive en
// el Provider, no acá, así que sobrevive a los cambios de pantalla.
//
// Reusa uploadRecurso() de portalApi tal cual: video → Bunny por TUS,
// imagen → Storage, y el registro en funnel_resources lo hace la RPC.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef } from 'react';
import { IcoUpload, IcoCheck, IcoWarn } from '../../components/icons';
import { Spinner } from '../../components/ui';
import { TO, F, dsp, chip } from '../tokens';
import { uploadRecurso } from '../../data/portalApi';
import { useOnboarding } from '../OnboardingProvider';

export default function CampoSubida({ q, bloqueante }) {
  const { subiendo, registrarSubida, setEstado } = useOnboarding();
  const inputRef = useRef(null);

  const mios = useMemo(
    () => subiendo.filter((s) => s.bucket === q.bucket),
    [subiendo, q.bucket],
  );

  const yaSubidos = Number(bloqueante?.subidos || 0);
  const listos = mios.filter((s) => s.done).length;
  const total = yaSubidos + listos;
  const meta = Math.max(q.target || 1, 1);
  const completo = total >= meta;

  const elegir = (files) => {
    Array.from(files || []).forEach((file) => {
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const patch = registrarSubida({ uid, bucket: q.bucket, name: file.name, pct: 0 });

      uploadRecurso(q.bucket, file, (p) => patch({ pct: Math.round(p * 100) }))
        .then(() => {
          patch({ pct: 100, done: true });
          // El conteo del servidor llega en el próximo refresco; mientras tanto
          // lo adelantamos para que la barra no se quede quieta.
          setEstado((e) => (e ? {
            ...e,
            bloqueantes: (e.bloqueantes || []).map((b) => (b.bucket === q.bucket
              ? { ...b, subidos: Number(b.subidos || 0) + 1 } : b)),
          } : e));
        })
        .catch((err) => patch({ error: err?.message || 'No se pudo subir' }));
    });
  };

  return (
    <div>
      <div style={{ ...dsp(F.q, '-0.025em'), lineHeight: 1.22 }}>{q.label}</div>
      {q.sublabel && (
        <div style={{ fontSize: F.sub, lineHeight: 1.55, color: TO.body, marginTop: 9 }}>
          {q.sublabel}
        </div>
      )}
      {q.ayuda && (
        <div style={{
          fontSize: F.sub, lineHeight: 1.55, color: TO.body, marginTop: 12,
          padding: '13px 15px', background: TO.blueWash,
          borderLeft: `4px solid ${TO.blue}`, borderRadius: '4px 14px 14px 4px',
        }}>{q.ayuda}</div>
      )}

      {/* Dropzone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', marginTop: 18, padding: '30px 20px', cursor: 'pointer',
          borderRadius: 22, border: `2px dashed ${TO.blue}`, background: TO.blueWash,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{
          width: 58, height: 58, borderRadius: '50%', background: TO.blueBtn,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        }}>
          <IcoUpload size={25} stroke="#fff" sw={2.2} />
        </span>
        <span style={{ fontSize: 19, fontWeight: 800, color: TO.ink, letterSpacing: '-0.01em' }}>
          {total > 0 ? 'Subir más' : 'Elegir archivos'}
        </span>
        <span style={{ fontSize: F.meta, color: TO.body, textAlign: 'center', lineHeight: 1.5 }}>
          Podés elegir varios de una. Se siguen subiendo solos mientras seguís navegando.
        </span>
      </button>
      <input
        ref={inputRef} type="file" multiple hidden
        accept={q.bucket === 'branding' ? 'image/*,.pdf,.ai,.svg,.eps' : 'image/*,video/*,.pdf'}
        onChange={(e) => { elegir(e.target.files); e.target.value = ''; }}
      />

      {/* Estado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        {completo
          ? <span style={chip(TO.greenWash, TO.greenInk)}>
              <IcoCheck size={13} stroke={TO.greenInk} sw={3} /> Listo
            </span>
          : <span style={chip(TO.amberWash, TO.amber)}>{total} de {meta}</span>}
        {q.target > 1 && !completo && (
          <span style={{ fontSize: F.meta, fontWeight: 600, color: TO.body }}>
            Te {meta - total === 1 ? 'falta' : 'faltan'} {meta - total}.
          </span>
        )}
      </div>

      {/* Archivos de esta tanda */}
      {mios.length > 0 && (
        <div style={{
          marginTop: 16, background: '#fff', borderRadius: 18,
          border: `1px solid ${TO.line}`, padding: 4,
        }}>
          {mios.map((s, i) => (
            <div key={s.uid} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 13px',
              borderTop: i ? `1px solid ${TO.line}` : 'none',
            }}>
              <span style={{ flex: 'none', width: 22, display: 'flex', justifyContent: 'center' }}>
                {s.error ? <IcoWarn size={19} stroke={TO.redInk} />
                  : s.done ? <IcoCheck size={19} stroke={TO.greenInk} sw={2.6} />
                  : <Spinner size={17} />}
              </span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: F.meta, fontWeight: 600,
                color: s.error ? TO.redInk : TO.body,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{s.name}</span>
              <span style={{
                fontSize: F.meta, fontWeight: 700, color: TO.meta, flex: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {s.error ? 'Error' : s.done ? '' : `${s.pct}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {mios.some((s) => s.error) && (
        <div style={{
          marginTop: 12, padding: '13px 15px', borderRadius: 14, background: TO.redWash,
          border: '1px solid #F5C6C6', fontSize: F.meta, lineHeight: 1.5, color: TO.redInk,
          fontWeight: 600,
        }}>
          Algunos archivos no se pudieron subir. Suele ser la conexión: probá de nuevo
          con esos, o mandánoslos por WhatsApp y los cargamos nosotros.
        </div>
      )}
    </div>
  );
}

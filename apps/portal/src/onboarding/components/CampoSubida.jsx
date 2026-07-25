// ─────────────────────────────────────────────────────────────────────────────
// Subida de material.
//
// El movimiento clave del rediseño: este tramo dejó de estar al final y pasó a
// ser el segundo. La causa de que hoy el cliente no suba nada es que se lo
// pedimos cuando ya lleva una hora contestando.
//
// Y el truco que hace que deje de costar tiempo: la subida sigue corriendo en
// background mientras el cliente contesta el tramo siguiente. El estado vive en
// el Provider, no acá, así que sobrevive a la navegación — el cliente ve
// "3 de 5 subiendo" en el header mientras habla de su historia.
//
// Reusa uploadRecurso() de portalApi tal cual: video → Bunny por TUS,
// imagen → Storage, y el registro en funnel_resources lo hace la RPC.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef } from 'react';
import { T, display, pill } from '../../components/theme';
import { IcoUpload, IcoCheck, IcoWarn } from '../../components/icons';
import { Spinner } from '../../components/ui';
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
      <div style={{ ...display(21, '-0.025em'), lineHeight: 1.25 }}>{q.label}</div>
      {q.sublabel && (
        <div style={{ fontSize: 15.5, lineHeight: 1.55, color: T.text2, marginTop: 8 }}>
          {q.sublabel}
        </div>
      )}
      {q.ayuda && (
        <div style={{
          fontSize: 14.5, lineHeight: 1.5, color: T.textSoft, marginTop: 10,
          padding: '11px 13px', background: T.surface2, borderRadius: 12,
        }}>{q.ayuda}</div>
      )}

      {/* Dropzone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', marginTop: 16, padding: '26px 20px', cursor: 'pointer',
          borderRadius: 22, border: '2px dashed #C3CFEF', background: T.primaryWash,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{
          width: 52, height: 52, borderRadius: '50%', background: T.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        }}>
          <IcoUpload size={23} stroke="#fff" />
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>
          {total > 0 ? 'Subir más' : 'Elegir archivos'}
        </span>
        <span style={{ fontSize: 13.5, color: T.text2, textAlign: 'center', lineHeight: 1.5 }}>
          Podés elegir varios de una. Se siguen subiendo solos mientras contestás
          las próximas preguntas.
        </span>
      </button>
      <input
        ref={inputRef} type="file" multiple hidden
        accept={q.bucket === 'branding' ? 'image/*,.pdf,.ai,.svg,.eps' : 'image/*,video/*,.pdf'}
        onChange={(e) => { elegir(e.target.files); e.target.value = ''; }}
      />

      {/* Estado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14 }}>
        {completo
          ? <span style={pill('var(--mk-green-bg)', 'var(--mk-green)')}>
              <IcoCheck size={11} stroke="var(--mk-green)" sw={3} /> Listo
            </span>
          : <span style={pill('var(--mk-orange-bg)', 'var(--mk-orange)')}>
              {total} de {meta}
            </span>}
        {q.target > 1 && !completo && (
          <span style={{ fontSize: 13.5, color: T.text2 }}>
            Te faltan {meta - total}.
          </span>
        )}
      </div>

      {/* Archivos de esta tanda */}
      {mios.length > 0 && (
        <div style={{
          marginTop: 14, background: '#fff', borderRadius: 18,
          boxShadow: 'var(--shadow-md)', padding: '4px 4px',
        }}>
          {mios.map((s, i) => (
            <div key={s.uid} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px',
              borderTop: i ? '1px solid #EEF0F4' : 'none',
            }}>
              <span style={{ flex: 'none', width: 20, display: 'flex', justifyContent: 'center' }}>
                {s.error ? <IcoWarn size={17} stroke={T.red} />
                  : s.done ? <IcoCheck size={17} stroke={T.green} sw={2.5} />
                  : <Spinner size={16} />}
              </span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 14.5, color: s.error ? T.red : T.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{s.name}</span>
              <span style={{ fontSize: 13, color: T.text3, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                {s.error ? 'Error' : s.done ? '' : `${s.pct}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {mios.some((s) => s.error) && (
        <div style={{
          marginTop: 10, padding: '11px 13px', borderRadius: 12, background: T.redSoft,
          fontSize: 13.5, lineHeight: 1.5, color: '#991B1B',
        }}>
          Algunos archivos no se pudieron subir. Suele ser la conexión: probá de nuevo
          con esos, o mandánoslos por WhatsApp y los cargamos nosotros.
        </div>
      )}
    </div>
  );
}

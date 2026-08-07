// ─────────────────────────────────────────────────────────────────────────────
// Subida de archivos: el dropzone punteado del HTML y la lista de lo subido.
//
// Reusa `subirRecurso` sin tocarla, que es la que ya reparte el tráfico como
// corresponde: los pesados (video) van a Bunny por TUS desde el navegador y el
// resto a Supabase Storage. Cada campo declara su `bucket`, y eso es lo que
// hace que el archivo caiga en la carpeta de recursos correcta del cliente
// —autoridad, estilo de vida, productos, empresa, testimonios, branding—.
//
// La subida corre en el Provider, no acá: el cliente elige los archivos y sigue
// contestando mientras suben. Por eso el material deja de costar tiempo.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from 'react';
import { T } from '../tokens';
import { subirRecurso } from '../api';
import { useOnboarding } from '../OnboardingProvider';

const peso = (b) => (b / 1024 > 1024
  ? `${(b / 1048576).toFixed(1)} MB`
  : `${Math.round(b / 1024)} KB`);

// `compacto`: la misma subida pero como ANEXO de una pregunta de texto (ej. los
// casos de éxito, donde la captura del "antes/después" vale más que la descripción).
// Ahí la zona grande de arrastrar compite con el campo de escribir, así que se achica.
export default function CampoArchivos({ q, bloqueante, compacto = false }) {
  const { subiendo, registrarSubida, setEstado } = useOnboarding();
  const inputRef = useRef(null);
  const [encima, setEncima] = useState(false);

  const mios = useMemo(
    () => subiendo.filter((s) => s.bucket === q.bucket),
    [subiendo, q.bucket],
  );

  const yaSubidos = Number(bloqueante?.subidos || 0);
  const listos = mios.filter((s) => s.done).length;
  const total = yaSubidos + listos;
  const meta = Math.max(q.target || 1, 1);

  const elegir = (files) => {
    Array.from(files || []).forEach((file) => {
      const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const patch = registrarSubida({
        uid, bucket: q.bucket, name: file.name, size: peso(file.size), pct: 0,
      });

      subirRecurso(q.bucket, file, (p) => patch({ pct: Math.round(p * 100) }))
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
      <label
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); elegir(e.dataTransfer.files); }}
        style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 10,
          border: `1.5px dashed ${encima ? T.azul : T.lineTrazo}`,
          borderRadius: compacto ? 14 : 18, background: encima ? T.azulWash2 : '#fff',
          padding: compacto ? '14px 16px' : '30px 20px', cursor: 'pointer', textAlign: 'center',
          flexDirection: compacto ? 'row' : 'column',
          transition: 'border-color .15s, background .15s',
        }}>
        <div style={{
          width: compacto ? 30 : 44, height: compacto ? 30 : 44, flex: 'none',
          borderRadius: compacto ? 9 : 13, background: T.azulWash,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={compacto ? 15 : 21} height={compacto ? 15 : 21} viewBox="0 0 24 24" fill="none" stroke={T.azul}
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />
          </svg>
        </div>
        <div style={{ fontSize: compacto ? 13.5 : 14.5, fontWeight: 700, letterSpacing: '-.01em' }}>
          {q.archivoCta || 'Sube tus archivos'}
        </div>
        {!compacto && (
          <div style={{ fontSize: 12.5, color: T.faint, lineHeight: 1.5, maxWidth: 340 }}>
            {q.archivoHint || ''}
          </div>
        )}
        <input
          ref={inputRef} type="file" hidden
          multiple={q.archivoMultiple !== false}
          accept={q.archivoAccept && q.archivoAccept !== '*' ? q.archivoAccept : undefined}
          onChange={(e) => { elegir(e.target.files); e.target.value = ''; }}
        />
      </label>

      {/* Cuántos pide y cuántos van. Solo cuando pide más de uno: para un logo,
          decir "0 de 1" es ruido. */}
      {meta > 1 && (
        <div style={{
          fontSize: 12, color: total >= meta ? T.verdeTinta : T.muted,
          fontWeight: 700, marginTop: 10,
        }}>
          {total >= meta ? `Listo · ${total} subidas` : `${total} de ${meta}`}
        </div>
      )}

      {(mios.length > 0 || yaSubidos > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {yaSubidos > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
              border: `1px solid ${T.line}`, borderRadius: 12, padding: '10px 13px',
            }}>
              <div style={{
                width: 34, height: 34, flex: '0 0 34px', borderRadius: 9,
                background: T.verdeWash, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.verde}
                     strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                {yaSubidos} {yaSubidos === 1 ? 'archivo ya subido' : 'archivos ya subidos'}
              </div>
            </div>
          )}

          {mios.map((s) => (
            <div key={s.uid} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
              border: `1px solid ${s.error ? '#F3B0B0' : T.line}`, borderRadius: 12,
              padding: '10px 13px', animation: 'mkpop .22s ease both',
            }}>
              <div style={{
                width: 34, height: 34, flex: '0 0 34px', borderRadius: 9,
                background: s.error ? '#FEF2F2' : s.done ? T.verdeWash : T.fill,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: T.muted,
              }}>
                {s.error ? '!' : s.done ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.verde}
                       strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : `${s.pct || 0}%`}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{s.name}</div>
                <div style={{ fontSize: 11.5, color: s.error ? '#B02020' : T.faint }}>
                  {s.error || s.size || ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

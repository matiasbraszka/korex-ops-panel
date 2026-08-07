// Editor de la "Bienvenida y Reglas del servicio" del onboarding.
//
// A diferencia del resto del constructor (que escribe en las tablas
// onboarding_*), esto vive en la fila standalone app_settings key='onboarding_config'
// —la MISMA que lee el portal para el video y las reglas—. Se guarda con
// PATCH-merge para no pisar otras claves. Cuando cambia el texto de las reglas,
// la versión sube sola: la aceptación del cliente queda atada a la versión que
// aceptó.
import { useEffect, useState } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../../context/AppContext';
import RichTextEditor from '../notas/RichTextEditor';
import { sanitizeDelHtml } from '../clientes/funnels/delSanitize';

const input = 'w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500 bg-white';

// El roadmap de arranque, tal cual está escrito hoy en el portal. Sirve de punto de
// partida: si nunca se tocó desde acá, el portal usa esta misma lista.
const ROADMAP_BASE = {
  intro: 'Armar tus dos embudos nos lleva entre 20 y 30 días hábiles de trabajo, sin contar las demoras de tu lado (subir material, revisar, grabarte). Este es el recorrido:',
  nota_grabacion: '',
  nota_plazos: '',
  fases: [
    { n: 1, cuando: 'Arranque', titulo: 'Inicio del servicio', color: '#5B7CF5', tuParte: false,
      desc: 'Se oficializa con el contrato de prestación de servicios firmado y tu primer pago hecho.' },
    { n: 2, cuando: '7 a 10 días hábiles desde el onboarding', titulo: 'Primera entrega', color: '#8B5CF6', tuParte: false,
      desc: 'Estrategia, avatar, guiones de anuncios y VSL de tu primer embudo.' },
    { n: 3, cuando: '7 a 10 días hábiles desde tu grabación', titulo: 'Entrega para lanzamiento', color: '#F97316', tuParte: true,
      desc: 'Edición de tus anuncios y diseño de la landing de tu primer embudo.' },
    { n: 4, cuando: 'Cuando está todo armado', titulo: 'Presentación del sistema Korex', color: '#06B6D4', tuParte: false,
      desc: 'Te mostramos el sistema completo, listo para salir a la calle.' },
    { n: 5, cuando: 'Salida a la calle', titulo: 'Lanzamiento del primer embudo', color: '#0EA5E9', tuParte: false,
      desc: 'Encendemos las campañas y tu primer embudo sale a pauta.' },
    { n: 6, cuando: 'Hasta lograrlo', titulo: 'Optimización y re-lanzamientos', color: '#22C55E', tuParte: false,
      desc: 'Si el primer lanzamiento no da los resultados buscados, vamos por un segundo, tercero y hasta cuarto.' },
  ],
};
const COLORES = ['#5B7CF5', '#8B5CF6', '#F97316', '#06B6D4', '#0EA5E9', '#22C55E', '#EC4899', '#EF4444', '#F59E0B', '#64748B'];

export default function BienvenidaReglasEditor({ onClose }) {
  const { flash } = useApp();
  const [video, setVideo] = useState('');
  const [reglas, setReglas] = useState('');
  const [reglasBase, setReglasBase] = useState('');   // para detectar cambios y subir la versión
  const [version, setVersion] = useState('1');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ekey, setEkey] = useState(0);                // re-inicializa el editor cuando cargan los datos
  const [road, setRoad] = useState(ROADMAP_BASE);     // el camino del proyecto que ve el cliente

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'onboarding_config').maybeSingle();
      if (!vivo) return;
      const v = data?.value || {};
      setVideo(v.video_bienvenida || '');
      setReglas(v.reglas_html || '');
      setReglasBase(v.reglas_html || '');
      setVersion(v.reglas_version || '1');
      // Si nunca se editó, se arranca de la lista que hoy usa el portal.
      setRoad(v.roadmap && Array.isArray(v.roadmap.fases) && v.roadmap.fases.length
        ? { ...ROADMAP_BASE, ...v.roadmap }
        : ROADMAP_BASE);
      setEkey((k) => k + 1);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      const htmlLimpio = sanitizeDelHtml(reglas || '');
      const cambio = htmlLimpio !== (reglasBase || '');
      const nuevaVersion = cambio ? String((parseInt(version, 10) || 1) + 1) : version;
      // PATCH-merge: leer, mezclar y upsert (no pisa video ni otras claves).
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'onboarding_config').maybeSingle();
      const actual = data?.value || {};
      // Las fases se renumeran al guardar: mover o quitar una deja la numeración pareja.
      const roadLimpio = {
        ...road,
        fases: (road.fases || [])
          .filter((f) => String(f.titulo || '').trim() || String(f.cuando || '').trim())
          .map((f, i) => ({ ...f, n: i + 1 })),
      };
      const merged = {
        ...actual, video_bienvenida: video || '', reglas_html: htmlLimpio,
        reglas_version: nuevaVersion, roadmap: roadLimpio,
      };
      const { error } = await supabase.from('app_settings').upsert({ key: 'onboarding_config', value: merged }, { onConflict: 'key' });
      if (error) throw error;
      setReglasBase(htmlLimpio);
      setVersion(nuevaVersion);
      flash?.('Bienvenida y reglas guardadas. Los clientes las ven al recargar.');
      onClose?.();
    } catch (e) {
      flash?.('No se pudo guardar: ' + (e?.message || 'error'));
    }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[720px] max-h-[88vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <div className="text-[14px] font-bold text-gray-800">Bienvenida y Reglas del servicio</div>
            <div className="text-[11px] text-gray-400">Lo que el cliente ve al inicio del onboarding · versión {version}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none bg-transparent border-none cursor-pointer">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {cargando ? (
            <div className="text-center text-gray-400 text-[13px] py-10">Cargando…</div>
          ) : (
            <>
              <div className="mb-4">
                <span className="block text-[11px] font-semibold text-gray-500 mb-1">Video de bienvenida</span>
                <input value={video} onChange={(e) => setVideo(e.target.value)} className={input}
                  placeholder="https://www.loom.com/share/…  ·  https://youtu.be/…  ·  Bunny" />
                <div className="text-[10.5px] text-gray-400 mt-1">
                  Pegá el link tal como lo copiás de Loom, YouTube, Vimeo, Drive o Bunny: el portal
                  lo convierte solo al formato que se puede reproducir. Vacío = no se muestra reproductor.
                </div>
              </div>

              <span className="block text-[11px] font-semibold text-gray-500 mb-1">Reglas del servicio (documento)</span>
              <RichTextEditor key={ekey} value={reglas} onChange={setReglas} sanitize={sanitizeDelHtml}
                minHeight={300} placeholder="Escribí o pegá acá las reglas del servicio…" />
              <div className="text-[10.5px] text-gray-400 mt-1">
                Al cambiar el texto, la versión sube sola. La aceptación del cliente queda atada a la versión que aceptó.
              </div>

              {/* ── El camino del proyecto (roadmap) ───────────────────────── */}
              <div className="mt-6 pt-5 border-t border-gray-100">
                <div className="text-[12.5px] font-bold text-gray-800">El camino de tu proyecto</div>
                <div className="text-[10.5px] text-gray-400 mb-3">
                  Las fases con sus plazos que el cliente ve al empezar el onboarding y al terminarlo.
                </div>

                <span className="block text-[11px] font-semibold text-gray-500 mb-1">Texto de arriba</span>
                <textarea value={road.intro || ''} rows={2}
                  onChange={(e) => setRoad((r) => ({ ...r, intro: e.target.value }))}
                  className={input + ' resize-y'} />

                <div className="flex flex-col gap-2 mt-3">
                  {(road.fases || []).map((f, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0"
                          style={{ background: f.color || '#5B7CF5' }}>{i + 1}</span>
                        <input value={f.titulo || ''} placeholder="Título de la fase"
                          onChange={(e) => setRoad((r) => ({ ...r, fases: r.fases.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)) }))}
                          className="flex-1 min-w-0 py-1.5 px-2 text-[12.5px] font-semibold border border-gray-200 rounded outline-none focus:border-blue-500" />
                        <button type="button" title="Subir" disabled={i === 0}
                          onClick={() => setRoad((r) => { const a = [...r.fases]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...r, fases: a }; })}
                          className="px-1 text-[11px] text-gray-300 hover:text-gray-700 bg-transparent border-none cursor-pointer disabled:opacity-30">↑</button>
                        <button type="button" title="Bajar" disabled={i === (road.fases || []).length - 1}
                          onClick={() => setRoad((r) => { const a = [...r.fases]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...r, fases: a }; })}
                          className="px-1 text-[11px] text-gray-300 hover:text-gray-700 bg-transparent border-none cursor-pointer disabled:opacity-30">↓</button>
                        <button type="button" title="Quitar esta fase"
                          onClick={() => setRoad((r) => ({ ...r, fases: r.fases.filter((_, j) => j !== i) }))}
                          className="px-1 text-[11px] text-gray-300 hover:text-red-600 bg-transparent border-none cursor-pointer">✕</button>
                      </div>
                      <input value={f.cuando || ''} placeholder="Cuándo (ej: 7 a 10 días hábiles desde el onboarding)"
                        onChange={(e) => setRoad((r) => ({ ...r, fases: r.fases.map((x, j) => (j === i ? { ...x, cuando: e.target.value } : x)) }))}
                        className="w-full py-1.5 px-2 text-[12px] border border-gray-200 rounded outline-none focus:border-blue-500" />
                      <textarea value={f.desc || ''} rows={2} placeholder="Qué pasa en esta fase"
                        onChange={(e) => setRoad((r) => ({ ...r, fases: r.fases.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) }))}
                        className="w-full py-1.5 px-2 text-[12px] border border-gray-200 rounded outline-none focus:border-blue-500 resize-y" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          {COLORES.map((c) => (
                            <button key={c} type="button" title={c}
                              onClick={() => setRoad((r) => ({ ...r, fases: r.fases.map((x, j) => (j === i ? { ...x, color: c } : x)) }))}
                              className="w-4 h-4 rounded-full border-none cursor-pointer"
                              style={{ background: c, boxShadow: (f.color || '#5B7CF5') === c ? `0 0 0 2px #fff, 0 0 0 3.5px ${c}` : undefined }} />
                          ))}
                        </span>
                        <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer">
                          <input type="checkbox" checked={!!f.tuParte} className="cursor-pointer"
                            onChange={(e) => setRoad((r) => ({ ...r, fases: r.fases.map((x, j) => (j === i ? { ...x, tuParte: e.target.checked } : x)) }))} />
                          Incluye su grabación
                        </label>
                      </div>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setRoad((r) => ({ ...r, fases: [...(r.fases || []), { cuando: '', titulo: '', desc: '', color: COLORES[(r.fases || []).length % COLORES.length], tuParte: false }] }))}
                    className="self-start text-[11.5px] text-blue-600 hover:text-blue-800 bg-transparent border-none cursor-pointer px-1.5">
                    + fase
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <span className="block text-[11px] font-semibold text-gray-500 mb-1">Nota · cronómetro de grabación</span>
                    <textarea value={road.nota_grabacion || ''} rows={3}
                      onChange={(e) => setRoad((r) => ({ ...r, nota_grabacion: e.target.value }))}
                      placeholder="Vacío = se usa el texto de siempre (10 días para grabarte…)"
                      className={input + ' resize-y'} />
                  </div>
                  <div>
                    <span className="block text-[11px] font-semibold text-gray-500 mb-1">Nota · días hábiles y pausas</span>
                    <textarea value={road.nota_plazos || ''} rows={3}
                      onChange={(e) => setRoad((r) => ({ ...r, nota_plazos: e.target.value }))}
                      placeholder="Vacío = se usa el texto de siempre (los plazos corren sobre días hábiles…)"
                      className={input + ' resize-y'} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-2 text-[13px] rounded border border-gray-200 bg-white text-gray-600 cursor-pointer">Cancelar</button>
          <button onClick={guardar} disabled={guardando || cargando}
            className="px-4 py-2 text-[13px] rounded bg-blue-600 text-white font-semibold cursor-pointer disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

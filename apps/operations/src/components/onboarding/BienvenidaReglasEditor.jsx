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

export default function BienvenidaReglasEditor({ onClose }) {
  const { flash } = useApp();
  const [video, setVideo] = useState('');
  const [reglas, setReglas] = useState('');
  const [reglasBase, setReglasBase] = useState('');   // para detectar cambios y subir la versión
  const [version, setVersion] = useState('1');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ekey, setEkey] = useState(0);                // re-inicializa el editor cuando cargan los datos

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
      const merged = { ...actual, video_bienvenida: video || '', reglas_html: htmlLimpio, reglas_version: nuevaVersion };
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
                <span className="block text-[11px] font-semibold text-gray-500 mb-1">Video de bienvenida (URL para incrustar)</span>
                <input value={video} onChange={(e) => setVideo(e.target.value)} className={input}
                  placeholder="https://iframe.mediadelivery.net/embed/707218/..." />
                <div className="text-[10.5px] text-gray-400 mt-1">La URL embed del video (Bunny, YouTube, etc.). Vacío = no se muestra reproductor.</div>
              </div>

              <span className="block text-[11px] font-semibold text-gray-500 mb-1">Reglas del servicio (documento)</span>
              <RichTextEditor key={ekey} value={reglas} onChange={setReglas} sanitize={sanitizeDelHtml}
                minHeight={300} placeholder="Escribí o pegá acá las reglas del servicio…" />
              <div className="text-[10.5px] text-gray-400 mt-1">
                Al cambiar el texto, la versión sube sola. La aceptación del cliente queda atada a la versión que aceptó.
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

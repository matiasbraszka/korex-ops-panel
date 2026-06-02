import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles } from 'lucide-react';

// Editor del feature flag global para activar la nueva UX de informes:
// bullets categorizados (entregable/avance) + auto-fill del semanal desde
// los diarios. Mientras esta apagado, el modal funciona como antes.

export default function InformesFlagsEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(!!appSettings?.informes_bullets_enabled);
  }, [appSettings?.informes_bullets_enabled]);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    try {
      await updateAppSettings({ informes_bullets_enabled: next });
    } catch (e) {
      setEnabled(!next); // revertir
      alert('No se pudo guardar el cambio. Reintentá.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="bg-white rounded-lg p-2 border border-blue-200">
            <Sparkles size={20} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-[15px] font-bold text-gray-800">Bullets con categoría (beta)</h2>
              <button
                type="button"
                onClick={toggle}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                  enabled ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="text-[12.5px] text-gray-600 leading-relaxed">
              Cada bullet del informe se carga como una fila independiente con su categoría:
              <span className="font-semibold text-green-700"> Entregable</span> (trabajo terminado y entregado)
              o <span className="font-semibold text-blue-700">Avance</span> (trabajo en proceso).
            </p>
            <p className="text-[12.5px] text-gray-600 leading-relaxed mt-1.5">
              Además, el <strong>informe semanal se autocompleta</strong> sumando los avances de tus
              diarios. Si te falta algún diario de lunes a viernes, no podés guardar el semanal hasta cargarlo.
            </p>
            <div className="mt-3 text-[11.5px] text-gray-500 bg-white/60 rounded-md px-3 py-2 border border-gray-200">
              <strong>Solo afecta informes nuevos.</strong> Los viejos se siguen viendo como antes,
              y se pueden editar para clasificar sus bullets sin perder nada.
            </div>
          </div>
        </div>
      </div>

      <div className="text-[11.5px] text-gray-400">
        Estado actual: <span className={`font-bold ${enabled ? 'text-green-600' : 'text-gray-500'}`}>{enabled ? 'ACTIVADO' : 'DESACTIVADO'}</span>
      </div>
    </div>
  );
}

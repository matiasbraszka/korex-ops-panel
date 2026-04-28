import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import SaveBar from './SaveBar';

const DEFAULTS = {
  test_mode: true,
  test_email: 'troksgamer777@gmail.com',
  from_email: 'onboarding@resend.dev',
  from_name: 'Equipo Korex',
  reply_to: 'soporte@metodokorex.com',
};

export default function HistorialEmailEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const [draft, setDraft] = useState({ ...DEFAULTS, ...(appSettings?.historial_email || {}) });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft({ ...DEFAULTS, ...(appSettings?.historial_email || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const update = (patch) => { setDraft(prev => ({ ...prev, ...patch })); setDirty(true); };

  const handleSave = () => {
    updateAppSettings({ historial_email: draft });
    setDirty(false);
  };
  const handleCancel = () => {
    setDraft({ ...DEFAULTS, ...(appSettings?.historial_email || {}) });
    setDirty(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[700px] relative">
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-gray-800">Email del Historial</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">Configuración del envío del Resumen Semanal vía Resend.</p>
      </div>

      {/* Banner modo test */}
      {draft.test_mode && (
        <div className="mb-4 p-3 rounded-md border border-yellow-300 bg-yellow-50 flex items-start gap-3">
          <span className="text-yellow-600 text-base leading-none mt-0.5">⚠</span>
          <div className="text-[12px] text-yellow-800 leading-relaxed flex-1">
            <b>Modo test activo.</b> Todos los resúmenes que se envíen van a <b>{draft.test_email}</b>, no al cliente real. Apagá el toggle de abajo cuando estés seguro de que todo funciona.
          </div>
        </div>
      )}

      {/* Toggle test_mode */}
      <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-md bg-gray-50 cursor-pointer mb-4">
        <input
          type="checkbox"
          checked={!!draft.test_mode}
          onChange={e => update({ test_mode: e.target.checked })}
          className="w-4 h-4 accent-blue-500"
        />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-gray-800">Modo test</div>
          <div className="text-[11px] text-gray-500">Cuando está prendido, los emails del resumen se redirigen al email de testeo.</div>
        </div>
      </label>

      <div className="space-y-3">
        <Field label="Email de testeo" hint="A donde van TODOS los resúmenes mientras esté activo el modo test.">
          <input
            type="email"
            value={draft.test_email || ''}
            onChange={e => update({ test_email: e.target.value })}
            placeholder="troksgamer777@gmail.com"
            className="w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500"
          />
        </Field>

        <Field label="Email remitente (from)" hint="Mientras no verifiques el dominio en Resend, mantené onboarding@resend.dev. Después podés cambiar a admin@metodokorex.com.">
          <input
            type="email"
            value={draft.from_email || ''}
            onChange={e => update({ from_email: e.target.value })}
            placeholder="onboarding@resend.dev"
            className="w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500"
          />
        </Field>

        <Field label="Nombre del remitente" hint="Aparece como el nombre del que envía. Ej: 'Equipo Korex'.">
          <input
            type="text"
            value={draft.from_name || ''}
            onChange={e => update({ from_name: e.target.value })}
            placeholder="Equipo Korex"
            className="w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500"
          />
        </Field>

        <Field label="Reply-To" hint="Cuando el cliente conteste el email, la respuesta llega a esta dirección.">
          <input
            type="email"
            value={draft.reply_to || ''}
            onChange={e => update({ reply_to: e.target.value })}
            placeholder="soporte@metodokorex.com"
            className="w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500"
          />
        </Field>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-200">
        <div className="text-[11px] text-gray-500 leading-relaxed">
          <b>Pasos para que funcione:</b>
          <ol className="list-decimal ml-4 mt-1 space-y-0.5">
            <li>Crear cuenta gratis en <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">resend.com</a> y copiar la API key.</li>
            <li>En Supabase → Edge Functions → <code>send-resumen-email</code> → Secrets → agregar <code>RESEND_API_KEY</code>.</li>
            <li>Para enviar como <b>admin@metodokorex.com</b>: verificar el dominio metodokorex.com en Resend → Domains, agregar los DNS records que pide → cambiar el <i>from</i> arriba.</li>
          </ol>
        </div>
      </div>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-gray-700 mb-1">{label}</div>
      {children}
      {hint && <div className="text-[10px] text-gray-400 mt-1">{hint}</div>}
    </label>
  );
}

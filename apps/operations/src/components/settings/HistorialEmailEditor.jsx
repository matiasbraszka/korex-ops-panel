import { useState, useEffect } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../../context/AppContext';
import SaveBar from './SaveBar';

const DEFAULTS = {
  test_mode: true,
  test_email: 'metodokorex@gmail.com',
  from_email: 'onboarding@resend.dev',
  from_name: 'Equipo Korex',
  reply_to: 'soporte@metodokorex.com',
  auto_weekly_enabled: true,
};

export default function HistorialEmailEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const [draft, setDraft] = useState({ ...DEFAULTS, ...(appSettings?.historial_email || {}) });
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

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

  const handleRunNow = async (dryRun = false) => {
    setRunning(true); setRunResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-resumenes-semanales', {
        body: { dry_run: dryRun, force: true },
      });
      if (error) {
        setRunResult({ ok: false, error: error.message || String(error) });
      } else {
        setRunResult(data);
      }
    } catch (e) {
      setRunResult({ ok: false, error: e?.message || String(e) });
    }
    setRunning(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[760px] relative">
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-gray-800">Email del Historial</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">Configuración del envío del Resumen Semanal vía Resend.</p>
      </div>

      {/* Banner modo test */}
      {draft.test_mode && (
        <div className="mb-4 p-3 rounded-md border border-yellow-300 bg-yellow-50 flex items-start gap-3">
          <span className="text-yellow-600 text-base leading-none mt-0.5">⚠</span>
          <div className="text-[12px] text-yellow-800 leading-relaxed flex-1">
            <b>Modo test activo.</b> Todos los resúmenes (manuales + automáticos) van a <b>{draft.test_email}</b>, no al cliente real. Apagalo cuando hayas verificado el dominio en Resend.
          </div>
        </div>
      )}

      {/* Toggle test_mode */}
      <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-md bg-gray-50 cursor-pointer mb-3">
        <input
          type="checkbox"
          checked={!!draft.test_mode}
          onChange={e => update({ test_mode: e.target.checked })}
          className="w-4 h-4 accent-blue-500"
        />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-gray-800">Modo test</div>
          <div className="text-[11px] text-gray-500">Cuando está prendido, todos los emails se redirigen al email de testeo.</div>
        </div>
      </label>

      {/* Toggle auto_weekly_enabled */}
      <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-md bg-gray-50 cursor-pointer mb-4">
        <input
          type="checkbox"
          checked={draft.auto_weekly_enabled !== false}
          onChange={e => update({ auto_weekly_enabled: e.target.checked })}
          className="w-4 h-4 accent-blue-500"
        />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-gray-800">Envío automático cada viernes</div>
          <div className="text-[11px] text-gray-500">Cron de Supabase corre cada <b>viernes a las 9 AM (Buenos Aires)</b> y manda el resumen de la semana de cada cliente activo.</div>
        </div>
      </label>

      <div className="space-y-3 mb-4">
        <Field label="Email de testeo" hint="Mientras Resend no tenga el dominio metodokorex.com verificado, este email tiene que ser metodokorex@gmail.com (el de la cuenta Resend) — sino tira 502.">
          <input
            type="email"
            value={draft.test_email || ''}
            onChange={e => update({ test_email: e.target.value })}
            placeholder="metodokorex@gmail.com"
            className="w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500"
          />
        </Field>

        <Field label="Email remitente (from)" hint="Sin dominio verificado en Resend → onboarding@resend.dev. Con dominio verificado → admin@metodokorex.com.">
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

      {/* Sección: probar el job ahora */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-[13px] font-semibold text-gray-800">Probar el job ahora</div>
            <div className="text-[11px] text-gray-500">Corre el job manualmente sin esperar al viernes. Útil para confirmar que la configuración esté ok.</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button" disabled={running}
              onClick={() => handleRunNow(true)}
              className="py-1.5 px-3 text-[12px] border border-gray-200 hover:border-gray-300 bg-white rounded-md cursor-pointer font-sans text-gray-600 disabled:opacity-50"
              title="Calcula y muestra el resumen pero NO manda email"
            >Dry run</button>
            <button
              type="button" disabled={running}
              onClick={() => handleRunNow(false)}
              className="py-1.5 px-3 text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none rounded-md cursor-pointer font-sans disabled:opacity-50"
            >{running ? 'Corriendo…' : 'Enviar ahora'}</button>
          </div>
        </div>

        {runResult && (
          <div className={`mt-2 p-3 rounded-md text-[12px] ${runResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {runResult.ok ? (
              <>
                <b>✓ Job corrido</b> · Procesados: <b>{runResult.processed}</b> · Enviados: <b>{runResult.sent}</b> · Sin eventos: <b>{runResult.skipped_no_events}</b>{runResult.errored > 0 && <> · Errores: <b>{runResult.errored}</b></>}
                {runResult.test_mode && (
                  <div className="mt-1">Mandado a <b>{runResult.destinatario_efectivo}</b> (modo test).</div>
                )}
                {Array.isArray(runResult.details) && runResult.details.some(d => d.status === 'error') && (
                  <ul className="mt-1.5 ml-4 list-disc">
                    {runResult.details.filter(d => d.status === 'error').map((d, i) => (
                      <li key={i}><b>{d.name}</b>: {d.error}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <><b>⚠ Error</b>: {runResult.error}</>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-gray-200">
        <div className="text-[11px] text-gray-500 leading-relaxed">
          <b>Pasos para que funcione end-to-end:</b>
          <ol className="list-decimal ml-4 mt-1 space-y-0.5">
            <li>Crear cuenta gratis en <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">resend.com</a> y copiar la API key.</li>
            <li>En Supabase → Edge Functions → Manage secrets → agregar <code>RESEND_API_KEY</code>.</li>
            <li>Para enviar como <b>admin@metodokorex.com</b>: verificar el dominio en Resend → Domains, agregar los DNS records en Vercel → cambiar el <i>from</i> arriba a <code>admin@metodokorex.com</code>.</li>
            <li>Cuando todo esté ok, apagar <b>Modo test</b> y los resúmenes empiezan a ir a los clientes reales (cada viernes 9 AM BUE).</li>
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

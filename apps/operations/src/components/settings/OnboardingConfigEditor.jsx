import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import SaveBar from './SaveBar';

// Config del proceso de onboarding de clientes (mensajes, carpetas, links, canal de
// Slack y pasos del proceso). Se guarda en app_settings('global').onboarding_config y
// la usan la Edge Function `crear-venta`, `form-config` y la página del proceso.
const DEFAULTS = {
  whatsapp_request_msg: '',
  onboarding_handoff_msg: '',
  calendar_link: 'https://startup.metodokorex.com/llamadaservicio',
  doc_title: 'Onboarding Korex y {LABEL}',
  strategy_folder: 'Estrategia #1 | [A DEFINIR] | {FECHA}',
  subfolders: ['1. Anuncios (Audiovisual)', '2. Estrategia', '3. Recursos', '4. VSL (Audiovisual)', '5. Mural de Instagram', '6. Auditoria', '7. Otros'],
  nested: {},
  process_steps: [],
  slack_exclude_ids: [],
  slack_exclude: [],
};

const input = 'w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500';
const area = input + ' font-mono leading-relaxed';

export default function OnboardingConfigEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const load = () => {
    const cfg = appSettings?.onboarding_config || {};
    const slackExclude = Array.isArray(cfg.slack_exclude) && cfg.slack_exclude.length
      ? cfg.slack_exclude
      : (cfg.slack_exclude_ids || []).map((id) => ({ name: '', id }));
    return { ...DEFAULTS, ...cfg, slack_exclude: slackExclude };
  };
  const [draft, setDraft] = useState(load);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const update = (patch) => { setDraft((p) => ({ ...p, ...patch })); setDirty(true); };

  const handleSave = () => {
    // Guardar slack_exclude (con nombres, para la UI) y slack_exclude_ids (ids, para la función).
    const slack_exclude = (draft.slack_exclude || []).filter((r) => (r.id || '').trim());
    const slack_exclude_ids = slack_exclude.map((r) => r.id.trim());
    updateAppSettings({ onboarding_config: { ...draft, slack_exclude, slack_exclude_ids } });
    setDirty(false);
  };
  const handleCancel = () => { setDraft(load()); setDirty(false); };

  // Helpers de listas
  const setSubfolder = (i, v) => update({ subfolders: draft.subfolders.map((s, j) => (j === i ? v : s)) });
  const addSubfolder = () => update({ subfolders: [...draft.subfolders, ''] });
  const removeSubfolder = (i) => {
    const name = draft.subfolders[i];
    const nested = { ...draft.nested }; delete nested[name];
    update({ subfolders: draft.subfolders.filter((_, j) => j !== i), nested });
  };
  const moveSubfolder = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= draft.subfolders.length) return;
    const arr = [...draft.subfolders];[arr[i], arr[j]] = [arr[j], arr[i]];
    update({ subfolders: arr });
  };
  const setNested = (folder, csv) => {
    const children = csv.split(',').map((s) => s.trim()).filter(Boolean);
    const nested = { ...draft.nested };
    if (children.length) nested[folder] = children; else delete nested[folder];
    update({ nested });
  };

  const setStep = (i, patch) => update({ process_steps: draft.process_steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const addStep = () => update({ process_steps: [...draft.process_steps, { title: '', description: '' }] });
  const removeStep = (i) => update({ process_steps: draft.process_steps.filter((_, j) => j !== i) });
  const moveStep = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= draft.process_steps.length) return;
    const arr = [...draft.process_steps];[arr[i], arr[j]] = [arr[j], arr[i]];
    update({ process_steps: arr });
  };

  const setExclude = (i, patch) => update({ slack_exclude: draft.slack_exclude.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addExclude = () => update({ slack_exclude: [...draft.slack_exclude, { name: '', id: '' }] });
  const removeExclude = (i) => update({ slack_exclude: draft.slack_exclude.filter((_, j) => j !== i) });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[860px] relative space-y-6">
      <div>
        <h2 className="text-[14px] font-bold text-gray-800">Onboarding de clientes</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Todo lo que se genera al cargar una venta: mensajes, carpetas de Drive, links y canal de Slack. Los cambios se aplican sin tocar código.
        </p>
      </div>

      {/* Mensajes */}
      <Section title="Mensajes para copiar">
        <Field label="Mensaje 1 · Pedir datos por WhatsApp" hint="El que el closer copia desde el formulario para pedirle los datos al cliente.">
          <textarea rows={8} value={draft.whatsapp_request_msg} onChange={(e) => update({ whatsapp_request_msg: e.target.value })} className={area} />
        </Field>
        <Field label="Mensaje 2 · Handoff del onboarding" hint="Se muestra al terminar de cargar la venta. Usá {CALENDAR_LINK} y {ONBOARDING_LINK} donde quieras que vayan los links — se reemplazan solos.">
          <textarea rows={10} value={draft.onboarding_handoff_msg} onChange={(e) => update({ onboarding_handoff_msg: e.target.value })} className={area} />
        </Field>
      </Section>

      {/* Links */}
      <Section title="Links">
        <Field label="Link del calendario" hint="Reemplaza {CALENDAR_LINK} en el mensaje 2.">
          <input value={draft.calendar_link} onChange={(e) => update({ calendar_link: e.target.value })} className={input} />
        </Field>
      </Section>

      {/* Carpetas de Drive */}
      <Section title="Carpetas de Drive">
        <Field label="Nombre de la carpeta de estrategia" hint="{FECHA} se reemplaza por la fecha de la venta (DD-MM-AAAA).">
          <input value={draft.strategy_folder} onChange={(e) => update({ strategy_folder: e.target.value })} className={input} />
        </Field>
        <Field label="Título del documento de onboarding" hint="{LABEL} = Nombre | Empresa del cliente.">
          <input value={draft.doc_title} onChange={(e) => update({ doc_title: e.target.value })} className={input} />
        </Field>

        <div>
          <div className="text-[11px] font-semibold text-gray-700 mb-1">Subcarpetas de la estrategia</div>
          <div className="space-y-2">
            {draft.subfolders.map((sf, i) => (
              <div key={i} className="border border-gray-200 rounded-md p-2.5 bg-gray-50">
                <div className="flex gap-2 items-center">
                  <input value={sf} onChange={(e) => setSubfolder(i, e.target.value)} className={input + ' bg-white'} placeholder="Nombre de la subcarpeta" />
                  <button type="button" onClick={() => moveSubfolder(i, -1)} className="px-2 py-1 text-[12px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded bg-white">↑</button>
                  <button type="button" onClick={() => moveSubfolder(i, 1)} className="px-2 py-1 text-[12px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded bg-white">↓</button>
                  <button type="button" onClick={() => removeSubfolder(i)} className="px-2 py-1 text-[12px] text-red-400 hover:text-red-600 border border-gray-200 rounded bg-white">✕</button>
                </div>
                <input
                  value={(draft.nested[sf] || []).join(', ')}
                  onChange={(e) => setNested(sf, e.target.value)}
                  className={input + ' bg-white mt-2 text-[12px]'}
                  placeholder="Subcarpetas internas separadas por coma (opcional). Ej: Grabaciones, Terminados"
                />
              </div>
            ))}
          </div>
          <button type="button" onClick={addSubfolder} className="mt-2 text-[12.5px] text-blue-600 font-medium hover:underline">+ Agregar subcarpeta</button>
        </div>
      </Section>

      {/* Diagrama del proceso */}
      <Section title="Pasos del proceso (diagrama)">
        <p className="text-[11px] text-gray-400 -mt-1">Estos pasos se muestran en la pantalla "Onboarding" del panel.</p>
        <div className="space-y-2">
          {draft.process_steps.map((st, i) => (
            <div key={i} className="border border-gray-200 rounded-md p-2.5 bg-gray-50 flex gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-[12px] font-bold grid place-items-center shrink-0 mt-0.5">{i + 1}</div>
              <div className="flex-1 space-y-1.5">
                <input value={st.title} onChange={(e) => setStep(i, { title: e.target.value })} className={input + ' bg-white font-semibold'} placeholder="Título del paso" />
                <textarea rows={2} value={st.description} onChange={(e) => setStep(i, { description: e.target.value })} className={input + ' bg-white text-[12px]'} placeholder="Descripción del paso" />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" onClick={() => moveStep(i, -1)} className="px-2 py-0.5 text-[12px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded bg-white">↑</button>
                <button type="button" onClick={() => moveStep(i, 1)} className="px-2 py-0.5 text-[12px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded bg-white">↓</button>
                <button type="button" onClick={() => removeStep(i)} className="px-2 py-0.5 text-[12px] text-red-400 hover:text-red-600 border border-gray-200 rounded bg-white">✕</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addStep} className="mt-2 text-[12.5px] text-blue-600 font-medium hover:underline">+ Agregar paso</button>
      </Section>

      {/* Excluidos del canal de Slack */}
      <Section title="Canal de Slack — a quién NO sumar">
        <p className="text-[11px] text-gray-400 -mt-1">Al crear el canal privado del cliente se invita a todo el equipo, menos estas personas. El Slack User ID empieza con <b>U</b> (Perfil → Más → Copiar ID de miembro).</p>
        <div className="space-y-2">
          {draft.slack_exclude.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input value={r.name} onChange={(e) => setExclude(i, { name: e.target.value })} className={input} placeholder="Nombre (referencia)" />
              <input value={r.id} onChange={(e) => setExclude(i, { id: e.target.value })} className={input + ' font-mono'} placeholder="U0XXXXXXX" />
              <button type="button" onClick={() => removeExclude(i)} className="px-2.5 text-[12px] text-red-400 hover:text-red-600 border border-gray-200 rounded">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addExclude} className="mt-2 text-[12.5px] text-blue-600 font-medium hover:underline">+ Agregar persona</button>
      </Section>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0 space-y-3">
      <div className="text-[13px] font-bold text-gray-700">{title}</div>
      {children}
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

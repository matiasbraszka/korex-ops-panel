import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import SaveBar from './SaveBar';

// Valores por defecto del alta automática en la planilla de finanzas (los usa la
// Edge Function crear-venta → Apps Script cargar-cliente-finanzas).
const DEFAULTS = {
  eur_usd_rate: 1.08,
  stripe_fee_pct: 4.5,
  marketing_person: 'Jose Martin',
  crm_marketing_pct: 5,
  publicidad_marketing_pct: 1,
};

const numFields = ['eur_usd_rate', 'stripe_fee_pct', 'crm_marketing_pct', 'publicidad_marketing_pct'];

export default function FinanzasDefaultsEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const load = () => ({ ...DEFAULTS, ...(appSettings?.finanzas_defaults || {}) });
  const [draft, setDraft] = useState(load);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const update = (patch) => { setDraft((p) => ({ ...p, ...patch })); setDirty(true); };

  const handleSave = () => {
    // Normaliza numéricos (los inputs devuelven string).
    const clean = { ...draft };
    numFields.forEach((k) => {
      const n = Number(clean[k]);
      clean[k] = Number.isFinite(n) ? n : DEFAULTS[k];
    });
    clean.marketing_person = String(clean.marketing_person || '').trim() || DEFAULTS.marketing_person;
    updateAppSettings({ finanzas_defaults: clean });
    setDraft(clean);
    setDirty(false);
  };
  const handleCancel = () => { setDraft(load()); setDirty(false); };

  const inputCls = 'w-full border border-gray-200 rounded-md py-1.5 px-2.5 text-[13px] font-sans outline-none focus:border-blue-400 hover:border-gray-300';

  const Field = ({ label, hint, children }) => (
    <div className="space-y-1">
      <label className="block text-[12px] font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[600px] relative">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-gray-800">Alta automática en finanzas</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Valores por defecto que se escriben en la planilla (hojas Acuerdos e Ingresos) cuando se carga una venta.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Tasa EUR → USD" hint="Para llenar siempre las columnas EUR y USD en Ingresos.">
          <input type="number" step="0.0001" min="0" className={inputCls}
            value={draft.eur_usd_rate}
            onChange={(e) => update({ eur_usd_rate: e.target.value })} />
        </Field>

        <Field label="Comisión Stripe (%)" hint="Se descuenta del neto (col E) si el pago fue por Stripe.">
          <input type="number" step="0.1" min="0" className={inputCls}
            value={draft.stripe_fee_pct}
            onChange={(e) => update({ stripe_fee_pct: e.target.value })} />
        </Field>

        <Field label="Marketing por defecto" hint="Nombre que va en Acuerdos (col O) y en Personas implicadas.">
          <input type="text" className={inputCls}
            value={draft.marketing_person}
            onChange={(e) => update({ marketing_person: e.target.value })} />
        </Field>

        <div />

        <Field label="CRM Marketing (%)" hint="Acuerdos col V por defecto.">
          <input type="number" step="0.1" min="0" className={inputCls}
            value={draft.crm_marketing_pct}
            onChange={(e) => update({ crm_marketing_pct: e.target.value })} />
        </Field>

        <Field label="Publicidad Marketing (%)" hint="Acuerdos col Y por defecto.">
          <input type="number" step="0.1" min="0" className={inputCls}
            value={draft.publicidad_marketing_pct}
            onChange={(e) => update({ publicidad_marketing_pct: e.target.value })} />
        </Field>
      </div>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { notifMeta } from '../notifications/notifMeta';
import SaveBar from './SaveBar';

// Catálogo de notificaciones y alertas que el sistema dispara hoy, agrupadas por
// área. Cada una se puede prender/apagar desde acá. La semántica de guardado es:
// un tipo está PRENDIDO salvo que notifications_config.types[tipo] === false.
const GROUPS = [
  {
    title: 'Tareas y trabajo',
    hint: 'Avisos del tablero de tareas y comentarios.',
    items: [
      { type: 'task_assigned',  label: 'Tarea asignada',            desc: 'Cuando te asignan una tarea.' },
      { type: 'task_comment',   label: 'Comentario en una tarea',   desc: 'Cuando comentan una tarea tuya o donde participás.' },
      { type: 'comment_reply',  label: 'Respuesta a tu comentario', desc: 'Cuando responden un comentario tuyo.' },
      { type: 'mention',        label: 'Menciones (@)',             desc: 'Cuando te nombran con @ en un comentario.' },
      { type: 'task_overdue',   label: 'Tarea vencida',             desc: 'Aviso cuando una tarea pasa su fecha de entrega.' },
    ],
  },
  {
    title: 'Soporte',
    hint: 'Bandeja de WhatsApp / chats de soporte.',
    items: [
      {
        type: 'soporte_chat_assigned',
        label: 'Chat de soporte asignado',
        desc: 'Mensaje directo de Slack + aviso en el panel cuando te asignan un chat. No avisa la asignación por defecto (Zil).',
      },
    ],
  },
  {
    title: 'Alertas de dinero',
    hint: 'Mercury, Stripe y Kraken. Aparecen en el panel y (Mercury/Stripe) en Slack.',
    items: [
      { type: 'mercury_failed_transaction', label: 'Mercury: transacción fallida', desc: 'Un pago con la tarjeta/cuenta de Mercury fue rechazado.' },
      { type: 'stripe_refund',              label: 'Stripe: reembolso',            desc: 'Se procesó un reembolso en Stripe.' },
      { type: 'stripe_dispute',             label: 'Stripe: disputa / contracargo', desc: 'Se abrió una disputa (más urgente: tiene fecha límite).' },
      { type: 'kraken_deposit',             label: 'Kraken: depósito recibido',    desc: 'Entró un pago en cripto a la cuenta de Kraken.' },
    ],
  },
  {
    title: 'Contratos y publicidad',
    hint: 'DocuSign y cuentas de Meta Ads.',
    items: [
      { type: 'contract_signed',    label: 'Contrato firmado',            desc: 'Un cliente firmó (o declinó) un contrato.' },
      { type: 'contract_unlinked',  label: 'Contrato sin vincular',       desc: 'Llegó un contrato que no se pudo asociar a un cliente.' },
      { type: 'contract_renewal',   label: 'Renovación de contrato',      desc: 'Recordatorio de que vence una renovación.' },
      { type: 'meta_account_error', label: 'Meta: error en cuenta',       desc: 'Una cuenta publicitaria quedó deshabilitada o sin pago.' },
    ],
  },
];

const isOn = (types, type) => types?.[type] !== false;

export default function NotificationsAlertsEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const [draft, setDraft] = useState(() => ({ ...(appSettings?.notifications_config?.types || {}) }));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft({ ...(appSettings?.notifications_config?.types || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const toggle = (type) => {
    setDraft(prev => ({ ...prev, [type]: !isOn(prev, type) }));
    setDirty(true);
  };

  const handleSave = () => {
    const prevCfg = appSettings?.notifications_config || {};
    updateAppSettings({ notifications_config: { ...prevCfg, types: draft } });
    setDirty(false);
  };
  const handleCancel = () => {
    setDraft({ ...(appSettings?.notifications_config?.types || {}) });
    setDirty(false);
  };

  const offCount = Object.values(draft).filter(v => v === false).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[760px] relative">
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-gray-800">Notificaciones y alertas</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Prendé o apagá cada aviso que el sistema dispara. Apagado = no aparece en el panel (campana){' '}
          y, en las alertas de Mercury y Stripe, tampoco se manda a Slack.
          {offCount > 0 && <span className="text-orange-500 font-semibold"> · {offCount} apagada{offCount > 1 ? 's' : ''}</span>}
        </p>
      </div>

      <div className="space-y-5">
        {GROUPS.map(group => (
          <div key={group.title}>
            <div className="mb-2">
              <div className="text-[12px] font-bold text-gray-700">{group.title}</div>
              <div className="text-[10.5px] text-gray-400">{group.hint}</div>
            </div>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
              {group.items.map(item => {
                const on = isOn(draft, item.type);
                const { Icon, color } = notifMeta(item.type);
                return (
                  <div key={item.type} className="flex items-center gap-3 p-3 hover:bg-gray-50/60">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}1A`, color }}
                    >
                      <Icon size={16} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-800">{item.label}</div>
                      <div className="text-[11px] text-gray-500 leading-snug">{item.desc}</div>
                    </div>
                    <Switch on={on} onClick={() => toggle(item.type)} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 rounded-md bg-blue-50 border border-blue-100 text-[11px] text-blue-700 leading-relaxed">
        Los cambios se aplican al instante en todo el equipo. Un aviso apagado deja de generarse
        para todas las personas, no solo para vos.
      </div>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}

// Switch tipo iOS, sin dependencias.
function Switch({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative w-10 h-6 rounded-full shrink-0 transition-colors cursor-pointer border-none ${
        on ? 'bg-blue-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

import { MessageCircle, CalendarClock, BellRing, Headphones } from 'lucide-react';

// Placeholder de la bandeja de WhatsApp. Los cimientos (tablas, realtime,
// webhook del puente) ya existen; la bandeja funcional se construye encima.
const UPCOMING = [
  {
    Icon: MessageCircle,
    color: '#22C55E',
    bg: '#ECFDF5',
    title: 'Bandeja de WhatsApp',
    desc: 'Tus chats de WhatsApp Business dentro del panel: responder, asignar y vincular conversaciones a clientes.',
    status: 'En preparación',
  },
  {
    Icon: CalendarClock,
    color: '#5B7CF5',
    bg: '#EEF2FF',
    title: 'Calendario de citas',
    desc: 'Disponibilidad configurable, link público para agendar y sincronización con Google Calendar.',
    status: 'Próximamente',
  },
  {
    Icon: BellRing,
    color: '#F59E0B',
    bg: '#FFFBEB',
    title: 'Recordatorios automáticos',
    desc: 'Mensajes de WhatsApp automáticos cuando alguien agenda una cita, con frecuencia y plantillas configurables.',
    status: 'Próximamente',
  },
];

export default function InboxPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-text flex items-center gap-2">
          <Headphones size={22} style={{ color: '#F59E0B' }} />
          Soporte
        </h1>
        <p className="text-sm text-text2 mt-1">Bandeja de WhatsApp, citas y recordatorios automáticos</p>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-10 text-center mb-8">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#ECFDF5' }}>
          <MessageCircle size={30} style={{ color: '#22C55E' }} />
        </div>
        <h2 className="text-lg font-semibold text-text">La bandeja de WhatsApp está en preparación</h2>
        <p className="text-sm text-text2 mt-2 max-w-md mx-auto">
          El sistema ya está conectándose con tu número de WhatsApp Business.
          Cuando esté lista, vas a ver y responder tus chats desde acá.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {UPCOMING.map(({ Icon, color, bg, title, desc, status }) => (
          <div key={title} className="bg-surface border border-border rounded-xl p-5">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: bg }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div className="font-semibold text-text text-sm">{title}</div>
            <p className="text-xs text-text2 mt-1 leading-relaxed">{desc}</p>
            <span
              className="inline-block mt-3 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: bg, color }}
            >
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

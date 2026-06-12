import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CalendarClock, Mail } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { convName, resolveTemplate } from '../lib/format.js';
import Modal from './Modal.jsx';

const DURATIONS = [
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 hora' },
  { min: 90, label: '1:30 h' },
];

const pad = (n) => String(n).padStart(2, '0');
const dateISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeHM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const todayISO = () => dateISO(new Date());

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Agendar o reagendar una cita: crea/mueve el evento en Google Calendar
// (admin@metodokorex.com via Apps Script) + reunión de Zoom, invita al
// prospecto por mail si se carga su email, y manda el WhatsApp opcional.
// appointment=null → crear; con una cita → reagendar esa cita.
export default function ScheduleModal({ open, onClose, appointment = null }) {
  const { selectedConversation: conv, appointmentTemplate, createAppointment, rescheduleAppointment } = useSoporte();
  const editing = Boolean(appointment);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [confirmDirty, setConfirmDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const name = conv ? convName(conv) : '';
  const firstName = name.split(' ')[0] || name;

  // Mensaje de WhatsApp resuelto (editable; si el usuario lo tocó, no se pisa
  // al cambiar fecha/hora). Al reagendar, el texto avisa el cambio.
  const resolved = useMemo(() => {
    if (!date || !time) return '';
    const d = new Date(`${date}T${time}`);
    const fecha = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (editing) {
      return `Hola ${firstName}! Movimos nuestra reunión para el ${fecha} a las ${time}. Cualquier cosa avisame por acá 👍`;
    }
    return resolveTemplate(appointmentTemplate, { nombre: firstName, fecha, hora: time });
  }, [appointmentTemplate, firstName, date, time, editing]);

  useEffect(() => {
    if (open) {
      if (appointment) {
        const start = new Date(appointment.start_at);
        const end = appointment.end_at ? new Date(appointment.end_at) : null;
        setTitle(appointment.title || '');
        setDate(dateISO(start));
        setTime(timeHM(start));
        setDuration(end ? Math.max(15, Math.round((end - start) / 60000)) : 60);
        setNotes(appointment.notes || '');
        setInviteEmail(appointment.invite_email || '');
      } else {
        setTitle(`Llamada con ${firstName}`);
        setDate(todayISO());
        setTime('10:00');
        setDuration(60);
        setNotes('');
        setInviteEmail('');
      }
      setSendConfirmation(true);
      setConfirmDirty(false);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conv?.id, appointment?.id]);

  useEffect(() => {
    if (!confirmDirty) setConfirmText(resolved);
  }, [resolved, confirmDirty]);

  if (!conv) return null;

  const submit = async () => {
    setError('');
    if (!title.trim() || !date || !time) { setError('Completá título, fecha y hora.'); return; }
    const start = new Date(`${date}T${time}`);
    if (isNaN(start.getTime())) { setError('Fecha u hora inválida.'); return; }
    const email = inviteEmail.trim().toLowerCase();
    if (!editing && email && !EMAIL_RE.test(email)) { setError('El email del invitado no parece válido.'); return; }
    const end = new Date(start.getTime() + duration * 60000);
    setSaving(true);
    try {
      if (editing) {
        await rescheduleAppointment(conv.id, {
          appointment_id: appointment.id,
          title: title.trim(),
          notes: notes.trim() || null,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          send_update: sendConfirmation && !conv.is_group,
          update_text: confirmText.trim(),
        });
      } else {
        await createAppointment({
          conversation_id: conv.id,
          title: title.trim(),
          notes: notes.trim() || null,
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          invite_email: email || null,
          send_confirmation: sendConfirmation && !conv.is_group,
          confirmation_text: confirmText.trim(),
        });
      }
      onClose();
    } catch (e) {
      console.error('crear-cita fallo', e);
      setError(editing
        ? 'No se pudo reagendar la cita. Probá de nuevo en unos segundos.'
        : 'No se pudo crear la cita. Revisá la conexión con Google Calendar (Configuración) y probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const ActionIcon = editing ? CalendarClock : CalendarPlus;

  return (
    <Modal open={open} onClose={onClose}
           title={editing ? `Reagendar: ${appointment.title}` : `Agendar con ${name}`} maxWidth={460}
           footer={
             <>
               <button onClick={onClose}
                       className="py-2 px-3.5 rounded-lg border border-border bg-white text-[12.5px] font-medium text-text2 cursor-pointer hover:bg-surface2">
                 Cancelar
               </button>
               <button onClick={submit} disabled={saving}
                       className={`py-2 px-3.5 rounded-lg border-0 text-[12.5px] font-semibold flex items-center gap-1.5 ${saving ? 'bg-surface2 text-text3 cursor-default' : 'bg-[#F59E0B] text-white cursor-pointer hover:opacity-90'}`}>
                 <ActionIcon size={14} /> {saving ? 'Guardando…' : editing ? 'Reagendar cita' : 'Agendar cita'}
               </button>
             </>
           }>
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-bold text-text3 uppercase tracking-wider block mb-1">Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
                 className="w-full px-3 py-2 text-[13px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="text-[11px] font-bold text-text3 uppercase tracking-wider block mb-1">Fecha</label>
            <input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)}
                   className="w-full px-2 py-2 text-[12.5px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-text3 uppercase tracking-wider block mb-1">Hora</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                   className="w-full px-2 py-2 text-[12.5px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-text3 uppercase tracking-wider block mb-1">Duración</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full px-2 py-2 text-[12.5px] rounded-lg border border-border outline-none bg-white cursor-pointer">
              {DURATIONS.map((d) => <option key={d.min} value={d.min}>{d.label}</option>)}
            </select>
          </div>
        </div>
        {!conv.is_group && (
          <div>
            <label className="text-[11px] font-bold text-text3 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Mail size={11} /> Email del invitado (opcional)
            </label>
            {editing ? (
              <div className="px-3 py-2 text-[12.5px] rounded-lg border border-border bg-surface2 text-text2">
                {appointment.invite_email || 'Sin invitado por mail'}
                <span className="block text-[10.5px] text-text3 mt-0.5">
                  Al reagendar, el cambio le llega solo a su calendario.
                </span>
              </div>
            ) : (
              <>
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                       type="email" placeholder="prospecto@empresa.com"
                       className="w-full px-3 py-2 text-[13px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
                <div className="text-[10.5px] text-text3 mt-1">
                  Le llega la invitación de Google Calendar a su mail: el evento aparece en su
                  calendario y acá vas a ver si confirma que asiste.
                </div>
              </>
            )}
          </div>
        )}
        <div>
          <label className="text-[11px] font-bold text-text3 uppercase tracking-wider block mb-1">Notas (van al evento)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    className="w-full resize-none px-3 py-2 text-[12.5px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
        </div>
        {!conv.is_group && (
          <div className="border border-[#22C55E]/40 bg-[#ECFDF5]/60 rounded-lg p-2.5">
            <label className="flex items-center gap-2 cursor-pointer mb-1.5">
              <input type="checkbox" checked={sendConfirmation} onChange={(e) => setSendConfirmation(e.target.checked)}
                     className="cursor-pointer" />
              <span className="text-[12.5px] font-semibold">
                {editing ? 'Avisarle el cambio por WhatsApp' : 'Mandarle la confirmación por WhatsApp'}
              </span>
            </label>
            {sendConfirmation && (
              <>
                <textarea
                  value={confirmText}
                  onChange={(e) => { setConfirmText(e.target.value); setConfirmDirty(true); }}
                  rows={3}
                  className="w-full resize-none px-3 py-2 text-[12.5px] leading-relaxed rounded-lg border border-border bg-white outline-none focus:border-[#22C55E]"
                />
                <div className="text-[10.5px] text-text3 mt-1">
                  Si la cita tiene link de Zoom, se agrega solo al final del mensaje.
                </div>
              </>
            )}
          </div>
        )}
        {error && <div className="text-[12px] font-medium" style={{ color: '#DC2626' }}>{error}</div>}
      </div>
    </Modal>
  );
}

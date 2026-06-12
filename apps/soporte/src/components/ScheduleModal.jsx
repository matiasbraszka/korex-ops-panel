import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { convName, resolveTemplate } from '../lib/format.js';
import Modal from './Modal.jsx';

const DURATIONS = [
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 hora' },
  { min: 90, label: '1:30 h' },
];

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Agendar cita: crea el evento en Google Calendar (admin@metodokorex.com via
// Apps Script) y opcionalmente manda el WhatsApp de confirmación al contacto.
export default function ScheduleModal({ open, onClose }) {
  const { selectedConversation: conv, appointmentTemplate, createAppointment } = useSoporte();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState('');
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [confirmDirty, setConfirmDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const name = conv ? convName(conv) : '';
  const firstName = name.split(' ')[0] || name;

  // Mensaje de confirmación resuelto desde la plantilla (editable; si el
  // usuario lo tocó, no lo pisamos al cambiar fecha/hora).
  const resolved = useMemo(() => {
    if (!date || !time) return '';
    const d = new Date(`${date}T${time}`);
    const fecha = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return resolveTemplate(appointmentTemplate, { nombre: firstName, fecha, hora: time });
  }, [appointmentTemplate, firstName, date, time]);

  useEffect(() => {
    if (open) {
      setTitle(`Llamada con ${firstName}`);
      setDate(todayISO());
      setTime('10:00');
      setDuration(60);
      setNotes('');
      setSendConfirmation(true);
      setConfirmDirty(false);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conv?.id]);

  useEffect(() => {
    if (!confirmDirty) setConfirmText(resolved);
  }, [resolved, confirmDirty]);

  if (!conv) return null;

  const submit = async () => {
    setError('');
    if (!title.trim() || !date || !time) { setError('Completá título, fecha y hora.'); return; }
    const start = new Date(`${date}T${time}`);
    if (isNaN(start.getTime())) { setError('Fecha u hora inválida.'); return; }
    const end = new Date(start.getTime() + duration * 60000);
    setSaving(true);
    try {
      await createAppointment({
        conversation_id: conv.id,
        title: title.trim(),
        notes: notes.trim() || null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        send_confirmation: sendConfirmation && !conv.is_group,
        confirmation_text: confirmText.trim(),
      });
      onClose();
    } catch (e) {
      console.error('crear-cita fallo', e);
      setError('No se pudo crear la cita. Revisá la conexión con Google Calendar (Configuración) y probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Agendar con ${name}`} maxWidth={460}
           footer={
             <>
               <button onClick={onClose}
                       className="py-2 px-3.5 rounded-lg border border-border bg-white text-[12.5px] font-medium text-text2 cursor-pointer hover:bg-surface2">
                 Cancelar
               </button>
               <button onClick={submit} disabled={saving}
                       className={`py-2 px-3.5 rounded-lg border-0 text-[12.5px] font-semibold flex items-center gap-1.5 ${saving ? 'bg-surface2 text-text3 cursor-default' : 'bg-[#F59E0B] text-white cursor-pointer hover:opacity-90'}`}>
                 <CalendarPlus size={14} /> {saving ? 'Agendando…' : 'Agendar cita'}
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
              <span className="text-[12.5px] font-semibold">Mandarle la confirmación por WhatsApp</span>
            </label>
            {sendConfirmation && (
              <textarea
                value={confirmText}
                onChange={(e) => { setConfirmText(e.target.value); setConfirmDirty(true); }}
                rows={3}
                className="w-full resize-none px-3 py-2 text-[12.5px] leading-relaxed rounded-lg border border-border bg-white outline-none focus:border-[#22C55E]"
              />
            )}
          </div>
        )}
        {error && <div className="text-[12px] font-medium" style={{ color: '#DC2626' }}>{error}</div>}
      </div>
    </Modal>
  );
}

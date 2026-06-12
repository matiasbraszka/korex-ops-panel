import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Video, ExternalLink, MessageCircle,
  CalendarClock, CalendarX, Clock, ChevronDown, ChevronUp, Check,
} from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { fetchAppointmentsRange } from '../lib/api.js';
import Modal from '../components/Modal.jsx';

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DURATIONS = [
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 hora' },
  { min: 90, label: '1:30 h' },
];

const RSVP_DOT = {
  accepted: { color: '#15803D', label: 'Confirmó asistencia' },
  declined: { color: '#DC2626', label: 'No asiste' },
  tentative: { color: '#B45309', label: 'Quizás asista' },
  needs_action: { color: '#9CA3AF', label: 'Sin responder' },
};

const pad = (n) => String(n).padStart(2, '0');
const dateISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeHM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Lunes de la semana que contiene a `d`.
function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const apptName = (a) =>
  a.conversation?.contact?.full_name || a.conversation?.wa_profile_name ||
  (a.wa_jid || '').split('@')[0] || '—';

// Card compacta de una cita en la grilla.
function CitaCard({ a, onClick }) {
  const start = new Date(a.start_at);
  const rsvp = a.invite_email ? (RSVP_DOT[a.rsvp_status] || RSVP_DOT.needs_action) : null;
  return (
    <button onClick={onClick}
            className="w-full text-left px-2.5 py-2 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] hover:shadow-[0_2px_8px_rgba(21,128,61,0.14)] cursor-pointer transition-all duration-150">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-[#15803D]">{timeHM(start)}</span>
        {a.meeting_link && <Video size={10} className="text-[#2563EB] shrink-0" />}
        {rsvp && <span title={rsvp.label} className="w-2 h-2 rounded-full ml-auto shrink-0" style={{ background: rsvp.color }} />}
      </div>
      <div className="text-[11.5px] font-semibold truncate mt-0.5">{a.title}</div>
      <div className="text-[10.5px] text-text3 truncate">{apptName(a)}</div>
    </button>
  );
}

// Detalle + reagendar/cancelar desde el calendario.
function CitaModal({ appt, onClose, onChanged }) {
  const { cancelAppointment, rescheduleAppointment, selectConversation } = useSoporte();
  const navigate = useNavigate();
  const [mode, setMode] = useState('view'); // view | reschedule
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [notify, setNotify] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (appt) {
      const start = new Date(appt.start_at);
      const end = appt.end_at ? new Date(appt.end_at) : null;
      setDate(dateISO(start));
      setTime(timeHM(start));
      setDuration(end ? Math.max(15, Math.round((end - start) / 60000)) : 60);
      setMode('view');
      setNotify(true);
      setError('');
    }
  }, [appt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!appt) return null;
  const start = new Date(appt.start_at);
  const rsvp = appt.invite_email ? (RSVP_DOT[appt.rsvp_status] || RSVP_DOT.needs_action) : null;
  const convId = appt.conversation?.id || appt.conversation_id;
  const nombre = apptName(appt).split(' ')[0];

  const openChat = () => {
    if (!convId) return;
    selectConversation(convId);
    navigate('/soporte/inbox');
  };

  const doCancel = async () => {
    setWorking(true);
    setError('');
    try {
      await cancelAppointment(convId, appt.id);
      onChanged();
      onClose();
    } catch {
      setError('No se pudo cancelar. Probá de nuevo.');
    } finally {
      setWorking(false);
    }
  };

  const doReschedule = async () => {
    setError('');
    const newStart = new Date(`${date}T${time}`);
    if (isNaN(newStart.getTime())) { setError('Fecha u hora inválida.'); return; }
    const newEnd = new Date(newStart.getTime() + duration * 60000);
    const fecha = newStart.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    setWorking(true);
    try {
      await rescheduleAppointment(convId, {
        appointment_id: appt.id,
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
        send_update: notify && Boolean(convId) && !appt.conversation?.is_group,
        update_text: `Hola ${nombre}! Movimos nuestra reunión para el ${fecha} a las ${time}. Cualquier cosa avisame por acá 👍`,
      });
      onChanged();
      onClose();
    } catch {
      setError('No se pudo reagendar. Probá de nuevo en unos segundos.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={appt.title} maxWidth={420}
           footer={mode === 'view' ? (
             <>
               <button onClick={() => setMode('reschedule')}
                       className="py-2 px-3.5 rounded-[10px] border border-[#F5D9A8] bg-white text-[12.5px] font-bold text-[#B45309] cursor-pointer hover:bg-[#FEF0D7] flex items-center gap-1.5 transition-colors duration-150">
                 <CalendarClock size={14} /> Reagendar
               </button>
               <button onClick={doCancel} disabled={working}
                       className="py-2 px-3.5 rounded-[10px] border border-border bg-white text-[12.5px] font-semibold text-text2 cursor-pointer hover:border-[#DC2626]/50 hover:text-[#DC2626] flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-60">
                 <CalendarX size={14} /> {working ? 'Cancelando…' : 'Cancelar cita'}
               </button>
             </>
           ) : (
             <>
               <button onClick={() => setMode('view')}
                       className="py-2 px-3.5 rounded-[10px] border border-border bg-white text-[12.5px] font-medium text-text2 cursor-pointer hover:bg-surface2 transition-colors duration-150">
                 Volver
               </button>
               <button onClick={doReschedule} disabled={working}
                       className="py-2 px-3.5 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-60">
                 <Check size={14} /> {working ? 'Guardando…' : 'Confirmar cambio'}
               </button>
             </>
           )}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[13px] text-text2">
          <Clock size={14} className="text-text3" />
          <span className="capitalize">
            {start.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · {timeHM(start)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-text2">
          <MessageCircle size={14} className="text-text3" />
          {apptName(appt)}
        </div>
        {rsvp && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: rsvp.color }} />
            <span className="font-semibold" style={{ color: rsvp.color }}>{rsvp.label}</span>
            <span className="text-text3 truncate">{appt.invite_email}</span>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          {appt.meeting_link && (
            <a href={appt.meeting_link} target="_blank" rel="noopener noreferrer"
               className="text-[12px] font-semibold text-[#2563EB] no-underline hover:underline flex items-center gap-1">
              <Video size={12} /> Unirse a la reunión
            </a>
          )}
          {appt.gcal_link && (
            <a href={appt.gcal_link} target="_blank" rel="noopener noreferrer"
               className="text-[12px] font-semibold text-text2 no-underline hover:underline flex items-center gap-1">
              <ExternalLink size={11} /> Ver en Calendar
            </a>
          )}
          {convId && (
            <button onClick={openChat}
                    className="text-[12px] font-semibold text-[#B45309] bg-transparent border-0 cursor-pointer hover:underline flex items-center gap-1 p-0">
              <MessageCircle size={12} /> Abrir chat
            </button>
          )}
        </div>

        {mode === 'reschedule' && (
          <div className="border-t border-surface2 pt-3 flex flex-col gap-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1">Fecha</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                       className="w-full px-2 py-2 text-[12.5px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B]" />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1">Hora</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                       className="w-full px-2 py-2 text-[12.5px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B]" />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1">Duración</label>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full px-2 py-2 text-[12.5px] rounded-[10px] border border-border outline-none bg-white cursor-pointer">
                  {DURATIONS.map((d) => <option key={d.min} value={d.min}>{d.label}</option>)}
                </select>
              </div>
            </div>
            {!appt.conversation?.is_group && convId && (
              <label className="flex items-center gap-2 cursor-pointer text-[12.5px] font-medium">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="cursor-pointer" />
                Avisarle el cambio por WhatsApp
              </label>
            )}
            <div className="text-[10.5px] text-text3">
              Se mueve el evento de Calendar y la reunión de Zoom; los recordatorios se reprograman solos.
            </div>
          </div>
        )}
        {error && <div className="text-[12px] font-medium" style={{ color: '#DC2626' }}>{error}</div>}
      </div>
    </Modal>
  );
}

// Editor de disponibilidad (se guarda en soporte_config.availability; lo va a
// usar el futuro link público de agenda).
function Disponibilidad() {
  const { availability, saveAvailability } = useSoporte();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slotMin, setSlotMin] = useState(availability?.slot_minutes || 60);
  const [days, setDays] = useState(() => {
    const base = {};
    for (let i = 0; i < 7; i++) {
      const cfg = availability?.days?.[i];
      base[i] = cfg ? { ...cfg } : { enabled: false, from: '10:00', to: '18:00' };
    }
    return base;
  });

  const setDay = (i, patch) => setDays((prev) => ({ ...prev, [i]: { ...prev[i], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      await saveAvailability({ slot_minutes: slotMin, days });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-white">
      <button onClick={() => setOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-transparent border-0 cursor-pointer">
        <span className="flex items-center gap-2">
          <Clock size={15} className="text-[#B45309]" />
          <span className="text-[13px] font-bold">Mi disponibilidad</span>
          <span className="text-[10.5px] text-text3 max-md:hidden">para el futuro link público de agenda</span>
        </span>
        {open ? <ChevronUp size={15} className="text-text3" /> : <ChevronDown size={15} className="text-text3" />}
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {DAY_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-3 text-[12.5px]">
              <label className="flex items-center gap-2 w-[72px] cursor-pointer shrink-0">
                <input type="checkbox" checked={days[i].enabled} onChange={(e) => setDay(i, { enabled: e.target.checked })}
                       className="cursor-pointer" />
                <span className={days[i].enabled ? 'font-semibold' : 'text-text3'}>{label}</span>
              </label>
              {days[i].enabled ? (
                <span className="flex items-center gap-1.5">
                  <input type="time" value={days[i].from} onChange={(e) => setDay(i, { from: e.target.value })}
                         className="px-2 py-1 text-[12px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
                  <span className="text-text3">a</span>
                  <input type="time" value={days[i].to} onChange={(e) => setDay(i, { to: e.target.value })}
                         className="px-2 py-1 text-[12px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
                </span>
              ) : (
                <span className="text-[11.5px] text-text3">Sin atención</span>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3 mt-1 pt-2.5 border-t border-surface2 flex-wrap">
            <label className="flex items-center gap-2 text-[12.5px]">
              Turnos de
              <select value={slotMin} onChange={(e) => setSlotMin(Number(e.target.value))}
                      className="px-2 py-1 text-[12px] rounded-lg border border-border outline-none bg-white cursor-pointer">
                {DURATIONS.map((d) => <option key={d.min} value={d.min}>{d.label}</option>)}
              </select>
            </label>
            <button onClick={save} disabled={saving}
                    className="py-1.5 px-3.5 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12px] font-bold cursor-pointer hover:bg-[#E08C0B] transition-colors duration-150 disabled:opacity-60 ml-auto">
              {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
            </button>
          </div>
          <div className="text-[10.5px] text-text3">
            Esto todavía no agenda nada solo: queda listo para cuando activemos el link público
            donde los prospectos eligen horario.
          </div>
        </div>
      )}
    </div>
  );
}

// Página Citas: agenda semanal de todas las citas del módulo Soporte.
export default function CitasPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = new Date(weekStart); end.setDate(end.getDate() + 7);
      const rows = await fetchAppointmentsRange(weekStart.toISOString(), end.toISOString());
      setItems(rows);
    } catch (e) {
      console.error('soporte: fallo la carga de citas', e);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const map = {};
    for (const a of items) {
      const k = dateISO(new Date(a.start_at));
      (map[k] ||= []).push(a);
    }
    return map;
  }, [items]);

  const today = new Date();
  const isCurrentWeek = sameDay(weekStart, mondayOf(today));
  const moveWeek = (delta) => setWeekStart((prev) => { const d = new Date(prev); d.setDate(d.getDate() + delta * 7); return d; });
  const rangeLabel = `${days[0].toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="max-w-[1080px] mx-auto px-4 py-5 max-md:px-3 max-md:py-3 flex flex-col gap-4">
        {/* Header + navegación de semana */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#FEF0D7] flex items-center justify-center">
              <CalendarDays size={17} className="text-[#B45309]" />
            </span>
            <div>
              <div className="text-[16px] font-bold">Citas</div>
              <div className="text-[12px] text-text3 capitalize">{rangeLabel} · {items.length} esta semana</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => moveWeek(-1)} title="Semana anterior"
                    className="w-8 h-8 rounded-[10px] border border-border bg-white text-text2 cursor-pointer hover:bg-surface2 flex items-center justify-center transition-colors duration-150">
              <ChevronLeft size={15} />
            </button>
            <button onClick={() => setWeekStart(mondayOf(new Date()))} disabled={isCurrentWeek}
                    className={`h-8 px-3 rounded-[10px] border text-[12px] font-semibold transition-colors duration-150 ${isCurrentWeek ? 'border-[#F5D9A8] bg-[#FEF0D7] text-[#B45309] cursor-default' : 'border-border bg-white text-text2 cursor-pointer hover:bg-surface2'}`}>
              Hoy
            </button>
            <button onClick={() => moveWeek(1)} title="Semana siguiente"
                    className="w-8 h-8 rounded-[10px] border border-border bg-white text-text2 cursor-pointer hover:bg-surface2 flex items-center justify-center transition-colors duration-150">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Grilla semanal (desktop) */}
        <div className="grid grid-cols-7 gap-2 max-md:hidden">
          {days.map((d, i) => {
            const k = dateISO(d);
            const citas = byDay[k] || [];
            const isToday = sameDay(d, today);
            return (
              <div key={k} className={`rounded-2xl border min-h-[180px] flex flex-col ${isToday ? 'border-[#F5D9A8] bg-[#FFFBF2]' : 'border-border/70 bg-white'}`}>
                <div className="px-2.5 pt-2.5 pb-1.5">
                  <div className={`text-[10px] font-bold tracking-widest uppercase ${isToday ? 'text-[#B45309]' : 'text-text3'}`}>{DAY_LABELS[i]}</div>
                  <div className={`text-[15px] font-bold ${isToday ? 'text-[#B45309]' : 'text-text'}`}>{d.getDate()}</div>
                </div>
                <div className="flex-1 px-1.5 pb-1.5 flex flex-col gap-1.5">
                  {loading ? null : citas.map((a) => <CitaCard key={a.id} a={a} onClick={() => setSelected(a)} />)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Lista por día (mobile) */}
        <div className="hidden max-md:flex flex-col gap-3">
          {loading ? (
            <div className="text-center text-[12px] text-text3 py-8">Cargando citas…</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 px-6 rounded-2xl border border-dashed border-border bg-white">
              <CalendarDays size={26} className="mx-auto text-text3 mb-2" />
              <div className="text-[13px] font-semibold text-text2">Sin citas esta semana</div>
              <div className="text-[11.5px] text-text3 mt-1">Agendá desde cualquier chat con el botón Agendar.</div>
            </div>
          ) : (
            days.filter((d) => (byDay[dateISO(d)] || []).length > 0).map((d, _, arr) => {
              const k = dateISO(d);
              const isToday = sameDay(d, today);
              return (
                <div key={k}>
                  <div className={`text-[11px] font-bold tracking-widest uppercase mb-1.5 px-0.5 ${isToday ? 'text-[#B45309]' : 'text-text3'}`}>
                    {isToday ? 'Hoy · ' : ''}{d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {(byDay[k] || []).map((a) => <CitaCard key={a.id} a={a} onClick={() => setSelected(a)} />)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Vacío (desktop) */}
        {!loading && items.length === 0 && (
          <div className="text-center text-[12px] text-text3 -mt-1 max-md:hidden">
            Sin citas esta semana. Agendá desde cualquier chat con el botón <b className="font-semibold">Agendar</b>.
          </div>
        )}

        <Disponibilidad />
      </div>

      {selected && <CitaModal appt={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}

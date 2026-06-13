import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, Video, ExternalLink, MessageCircle,
  CalendarClock, CalendarX, Clock, Check, Plus, Search, Link2, Pencil,
} from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { fetchAppointmentsRange } from '../lib/api.js';
import { initials, colorFromString, convName, fmtPhone } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import ScheduleModal from '../components/ScheduleModal.jsx';

const DAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const HOUR_PX = 60; // 1 hora = 60px en la grilla
const DURATIONS = [
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 hora' },
  { min: 90, label: '1:30 h' },
];

// Estado visual: confirmada (el invitado aceptó) verde, pendiente ámbar.
const ESTADOS = {
  confirmada: { bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D', bar: '#22C55E', label: 'Confirmada' },
  pendiente: { bg: '#FEF0D7', border: '#F5D9A8', color: '#B45309', bar: '#F59E0B', label: 'Pendiente' },
};
const estadoOf = (a) => (a.rsvp_status === 'accepted' ? ESTADOS.confirmada : ESTADOS.pendiente);

const pad = (n) => String(n).padStart(2, '0');
const dateISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeHM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const apptName = (a) =>
  a.conversation?.contact?.full_name || a.conversation?.wa_profile_name ||
  (a.wa_jid || '').split('@')[0] || '—';

// ── Modal de detalle (ver / reagendar / cancelar) ──
function CitaModal({ appt, onClose, onChanged }) {
  const { cancelAppointment, rescheduleAppointment, selectConversation } = useSoporte();
  const navigate = useNavigate();
  const [mode, setMode] = useState('view');
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
  const est = estadoOf(appt);
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
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
                style={{ background: est.bg, color: est.color, border: `1px solid ${est.border}` }}>
            {est.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-text2">
          <MessageCircle size={14} className="text-text3" />
          {apptName(appt)}
          {appt.invite_email && <span className="text-[11px] text-text3 truncate">· {appt.invite_email}</span>}
        </div>
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

// ── Nueva cita: elegir el chat y abrir el ScheduleModal ──
function NuevaCitaModal({ open, onClose, onCreated }) {
  const { conversations } = useSoporte();
  const [q, setQ] = useState('');
  const [conv, setConv] = useState(null);

  useEffect(() => { if (open) { setQ(''); setConv(null); } }, [open]);
  if (!open) return null;

  if (conv) {
    return <ScheduleModal open onClose={() => { onClose(); onCreated(); }} conversation={conv} />;
  }

  const term = q.trim().toLowerCase();
  const list = conversations
    .filter((c) => !c.is_group)
    .filter((c) => !term || `${convName(c)} ${c.wa_phone || ''} ${c.client?.name || ''}`.toLowerCase().includes(term))
    .slice(0, 8);

  return (
    <Modal open onClose={onClose} title="Nueva cita" maxWidth={420}>
      <div className="flex flex-col gap-2.5">
        <div className="text-[12px] text-text2">¿Con quién es la reunión? Elegí el chat:</div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                 placeholder="Buscar contacto, teléfono, cliente…"
                 className="w-full h-[36px] pl-8 pr-3 text-[12.5px] rounded-[10px] border border-border bg-surface2 outline-none focus:border-[#F59E0B] focus:bg-white transition-colors" />
        </div>
        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
          {list.length === 0 ? (
            <div className="text-[12px] text-text3 text-center py-6">No hay chats con esa búsqueda.</div>
          ) : list.map((c) => {
            const name = convName(c);
            const color = colorFromString(c.wa_jid);
            return (
              <button key={c.id} onClick={() => setConv(c)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-border/70 bg-white hover:border-[#F59E0B]/45 cursor-pointer text-left transition-all duration-150">
                <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11.5px] shrink-0"
                      style={{ background: color + '1d', color }}>
                  {initials(name)}
                </span>
                <span className="flex-1 min-w-0 leading-tight">
                  <span className="block text-[12.5px] font-semibold truncate">{name}</span>
                  <span className="block text-[10.5px] text-text3">{fmtPhone(c.wa_phone)}</span>
                </span>
                {c.client?.name && (
                  <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#EEF2FF] text-[#4A67D8] truncate max-w-[100px] shrink-0">
                    {c.client.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// ── Disponibilidad: resumen en el rail + modal de edición ──
function DisponibilidadCard() {
  const { availability, saveAvailability } = useSoporte();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slotMin, setSlotMin] = useState(availability?.slot_minutes || 60);
  const [days, setDays] = useState(() => {
    const base = {};
    for (let i = 0; i < 7; i++) {
      const cfg = availability?.days?.[i];
      base[i] = cfg ? { ...cfg } : { enabled: false, from: '10:00', to: '18:00' };
    }
    return base;
  });
  const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const setDay = (i, patch) => setDays((prev) => ({ ...prev, [i]: { ...prev[i], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      await saveAvailability({ slot_minutes: slotMin, days });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const enabled = Object.entries(days).filter(([, d]) => d.enabled);

  return (
    <>
      <div className="rounded-xl border border-border bg-white p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold tracking-widest text-text3 uppercase">Disponibilidad</span>
          <button onClick={() => setEditing(true)}
                  className="text-[11px] font-semibold text-[#B45309] bg-transparent border-0 cursor-pointer hover:underline flex items-center gap-1 p-0">
            <Pencil size={10} /> Editar
          </button>
        </div>
        {enabled.length === 0 ? (
          <div className="text-[11.5px] text-text3">Sin horarios cargados todavía.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {enabled.map(([i, d]) => (
              <div key={i} className="flex items-center justify-between text-[11.5px]">
                <span className="font-semibold">{labels[i]}</span>
                <span className="text-text2">{d.from} – {d.to}</span>
              </div>
            ))}
            <div className="text-[10.5px] text-text3 mt-0.5">Turnos de {DURATIONS.find((x) => x.min === slotMin)?.label || `${slotMin} min`}</div>
          </div>
        )}
        <div className="text-[10px] text-text3 mt-2 leading-snug">
          El link público de agenda solo ofrece estos horarios (menos los ya tomados).
        </div>
      </div>

      {editing && (
        <Modal open onClose={() => setEditing(false)} title="Mi disponibilidad" maxWidth={400}
               footer={
                 <>
                   <button onClick={() => setEditing(false)}
                           className="py-2 px-3.5 rounded-[10px] border border-border bg-white text-[12.5px] font-medium text-text2 cursor-pointer hover:bg-surface2">
                     Cerrar
                   </button>
                   <button onClick={save} disabled={saving}
                           className="py-2 px-4 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-bold cursor-pointer hover:bg-[#E08C0B] disabled:opacity-60">
                     {saving ? 'Guardando…' : 'Guardar'}
                   </button>
                 </>
               }>
          <div className="flex flex-col gap-2">
            {labels.map((label, i) => (
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
            <label className="flex items-center gap-2 text-[12.5px] pt-2 border-t border-surface2 mt-1">
              Turnos de
              <select value={slotMin} onChange={(e) => setSlotMin(Number(e.target.value))}
                      className="px-2 py-1 text-[12px] rounded-lg border border-border outline-none bg-white cursor-pointer">
                {DURATIONS.map((d) => <option key={d.min} value={d.min}>{d.label}</option>)}
              </select>
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Mini-mes del rail: hoy en ámbar, puntos bajo días con citas ──
function MiniMonth({ cursor, dots, onPickDay, onMoveMonth }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const today = new Date();
  const monthLabel = cursor.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-bold">{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</span>
        <span className="flex items-center gap-0.5">
          <button onClick={() => onMoveMonth(-1)} className="w-5 h-5 rounded-md border-0 bg-transparent text-text3 hover:text-text hover:bg-surface2 cursor-pointer flex items-center justify-center">
            <ChevronLeft size={12} />
          </button>
          <button onClick={() => onMoveMonth(1)} className="w-5 h-5 rounded-md border-0 bg-transparent text-text3 hover:text-text hover:bg-surface2 cursor-pointer flex items-center justify-center">
            <ChevronRight size={12} />
          </button>
        </span>
      </div>
      <div className="grid gap-y-1 text-center" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => (
          <span key={i} className="text-[9px] font-bold text-text3">{l}</span>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          const hasDot = dots.has(dateISO(d));
          return (
            <button key={dateISO(d)} onClick={() => onPickDay(d)}
                    className="bg-transparent border-0 cursor-pointer p-0 flex flex-col items-center gap-px">
              <span className={`w-[22px] h-[22px] rounded-lg text-[10.5px] flex items-center justify-center ${
                isToday ? 'bg-[#F59E0B] text-white font-bold'
                : inMonth ? 'text-text font-medium hover:bg-surface2'
                : 'text-text3/60'}`}>
                {d.getDate()}
              </span>
              <span className={`w-1 h-1 rounded-full ${hasDot ? 'bg-[#22C55E]' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Vista mensual: celdas con chips de cita ──
function MonthGrid({ cursor, items, onPickDay, onPickCita }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const today = new Date();
  const byDay = {};
  for (const a of items) (byDay[dateISO(new Date(a.start_at))] ||= []).push(a);
  return (
    <div>
      <div className="grid border-b border-border" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {DAY_LABELS.map((l) => (
          <div key={l} className="text-center text-[9.5px] font-bold tracking-widest text-text3 py-2">{l}</div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {cells.map((d, idx) => {
          const k = dateISO(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          const citas = (byDay[k] || []).sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
          return (
            <div key={k} role="button" tabIndex={0} onClick={() => onPickDay(d)}
                 className={`min-h-[96px] p-1.5 border-b border-r border-surface2 cursor-pointer transition-colors duration-150 hover:bg-surface2/40 ${idx % 7 === 0 ? 'border-l-0' : ''} ${isToday ? 'bg-[#FFFBF2]' : 'bg-white'}`}>
              <span className={`inline-flex w-[22px] h-[22px] rounded-full text-[11px] font-bold items-center justify-center ${
                isToday ? 'bg-[#F59E0B] text-white' : inMonth ? 'text-text' : 'text-text3/50'}`}>
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-0.5 mt-0.5">
                {citas.slice(0, 3).map((a) => {
                  const est = estadoOf(a);
                  return (
                    <button key={a.id}
                            onClick={(e) => { e.stopPropagation(); onPickCita(a); }}
                            className="w-full text-left px-1.5 py-0.5 rounded-md cursor-pointer text-[9.5px] font-semibold truncate border-0"
                            style={{ background: est.bg, color: est.color, borderLeft: `2px solid ${est.bar}` }}>
                      {timeHM(new Date(a.start_at))} {a.title}
                    </button>
                  );
                })}
                {citas.length > 3 && (
                  <span className="text-[9px] font-semibold text-text3 px-1">+ {citas.length - 3} más</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Página Citas — diseño: rail izquierdo + grilla horaria semanal ──
export default function CitasPage() {
  const [view, setView] = useState('week'); // 'day' | 'week'
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [items, setItems] = useState([]);
  const [monthItems, setMonthItems] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [selected, setSelected] = useState(null);
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Link público de agenda (página /agendar, sin login).
  const copyPublicLink = () => {
    const url = `${window.location.origin}/agendar`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };
  const [mobileDay, setMobileDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const gridRef = useRef(null);

  // Rango visible según vista.
  const range = useMemo(() => {
    if (view === 'day') {
      const from = new Date(cursor);
      const to = new Date(cursor); to.setDate(to.getDate() + 1);
      return { from, to };
    }
    if (view === 'month') {
      const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      return { from, to };
    }
    const from = mondayOf(cursor);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    return { from, to };
  }, [view, cursor]);

  const days = useMemo(() => {
    if (view === 'day') return [new Date(cursor)];
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(range.from); d.setDate(d.getDate() + i); return d; });
  }, [view, cursor, range.from]);

  const load = useCallback(async () => {
    try {
      const [vis, month, upc] = await Promise.all([
        fetchAppointmentsRange(range.from.toISOString(), range.to.toISOString()),
        // Mes del mini-calendario (puntos) — rango del mes del cursor.
        fetchAppointmentsRange(
          new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString(),
          new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString(),
        ),
        fetchAppointmentsRange(new Date().toISOString(), new Date(Date.now() + 45 * 86400000).toISOString()),
      ]);
      setItems(vis);
      setMonthItems(month);
      setUpcoming(upc.slice(0, 5));
    } catch (e) {
      console.error('soporte: fallo la carga de citas', e);
    }
  }, [range.from, range.to, cursor]);

  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const map = {};
    for (const a of items) (map[dateISO(new Date(a.start_at))] ||= []).push(a);
    return map;
  }, [items]);

  const dots = useMemo(() => new Set(monthItems.map((a) => dateISO(new Date(a.start_at)))), [monthItems]);

  // Rango horario de la grilla: 09–18 ampliado si hay citas afuera.
  const [hourStart, hourEnd] = useMemo(() => {
    let s = 9, e = 18;
    for (const a of items) {
      const st = new Date(a.start_at);
      const en = a.end_at ? new Date(a.end_at) : new Date(st.getTime() + 3600000);
      s = Math.min(s, st.getHours());
      e = Math.max(e, en.getHours() + (en.getMinutes() > 0 ? 1 : 0));
    }
    return [s, Math.max(e, s + 6)];
  }, [items]);
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);

  const today = new Date();
  const now = new Date();
  const nowOffset = ((now.getHours() + now.getMinutes() / 60) - hourStart) * HOUR_PX;
  const showNowLine = days.some((d) => sameDay(d, today)) && nowOffset >= 0 && nowOffset <= hours.length * HOUR_PX;

  const move = (delta) => setCursor((prev) => {
    const d = new Date(prev);
    if (view === 'month') d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * (view === 'day' ? 1 : 7));
    return d;
  });
  const moveMonth = (delta) => setCursor((prev) => {
    const d = new Date(prev);
    d.setMonth(d.getMonth() + delta);
    return d;
  });
  const goToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); setCursor(d); setMobileDay(d); };

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const rangeLabel = view === 'day'
    ? cap(cursor.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))
    : view === 'month'
      ? cap(cursor.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }))
      : `${days[0].getDate()} – ${days[6].getDate()} de ${days[6].toLocaleDateString('es-AR', { month: 'long' })}, ${days[6].getFullYear()}`;

  // Posicionamiento de un bloque dentro de la columna del día.
  const blockStyle = (a) => {
    const st = new Date(a.start_at);
    const en = a.end_at ? new Date(a.end_at) : new Date(st.getTime() + 3600000);
    const top = ((st.getHours() + st.getMinutes() / 60) - hourStart) * HOUR_PX;
    const height = Math.max(30, ((en - st) / 3600000) * HOUR_PX - 4);
    return { top: `${top}px`, height: `${height}px` };
  };

  // ── Mobile: tira semanal + agenda del día ──
  const mobileWeek = useMemo(() => {
    const start = mondayOf(mobileDay);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  }, [mobileDay]);
  const [mobileItems, setMobileItems] = useState([]);
  useEffect(() => {
    const from = mondayOf(mobileDay);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    fetchAppointmentsRange(from.toISOString(), to.toISOString()).then(setMobileItems).catch(() => {});
  }, [mobileDay, items]);
  const mobileDayCitas = mobileItems
    .filter((a) => sameDay(new Date(a.start_at), mobileDay))
    .sort((a, b) => (a.start_at < b.start_at ? -1 : 1));

  return (
    <div className="h-full min-h-0 overflow-y-auto relative">
      {/* ════ DESKTOP ════ */}
      <div className="max-md:hidden px-4 py-4 flex flex-col gap-3.5 min-w-[980px]">
        {/* Header de página */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[17px] font-bold">Citas</div>
            <div className="text-[12px] text-text3">Reuniones agendadas desde la bandeja · confirmación automática por WhatsApp</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full border border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" /> Google Calendar conectado
            </span>
            <button onClick={copyPublicLink}
                    title="Copiar el link público para que los leads agenden solos"
                    className="h-[34px] px-3 rounded-[10px] border border-border bg-white text-[12px] font-semibold text-text2 cursor-pointer hover:border-[#F5D9A8] hover:text-[#B45309] flex items-center gap-1.5 transition-colors duration-150">
              <Link2 size={13} /> {linkCopied ? '✓ Link copiado' : 'Link público de agenda'}
            </button>
            <button onClick={() => setNuevaOpen(true)}
                    className="h-[34px] px-3.5 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1.5 shadow-[0_2px_6px_rgba(245,158,11,.35)] transition-colors duration-150">
              <Plus size={14} /> Nueva cita
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button onClick={goToday}
                  className="h-8 px-3 rounded-[10px] border border-border bg-white text-[12px] font-semibold text-text2 cursor-pointer hover:bg-surface2 transition-colors duration-150">
            Hoy
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => move(-1)} className="w-8 h-8 rounded-[10px] border border-border bg-white text-text2 cursor-pointer hover:bg-surface2 flex items-center justify-center transition-colors duration-150">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => move(1)} className="w-8 h-8 rounded-[10px] border border-border bg-white text-text2 cursor-pointer hover:bg-surface2 flex items-center justify-center transition-colors duration-150">
              <ChevronRight size={14} />
            </button>
          </div>
          <span className="text-[13.5px] font-bold">{rangeLabel}</span>
          <span className="flex-1" />
          <span className="flex items-center gap-3 text-[11px] text-text2">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#22C55E]" /> Confirmada</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> Pendiente</span>
          </span>
          <div className="flex items-center bg-surface2 rounded-[10px] p-0.5">
            {[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([id, label]) => (
              <button key={id} onClick={() => setView(id)}
                      className={`h-7 px-3 rounded-lg text-[11.5px] font-semibold border-0 cursor-pointer transition-all duration-150 ${view === id ? 'bg-white shadow-sm text-text' : 'bg-transparent text-text3'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3.5 items-start">
          {/* Rail izquierdo */}
          <div className="w-[264px] shrink-0 flex flex-col gap-3">
            <MiniMonth cursor={cursor} dots={dots} onMoveMonth={moveMonth}
                       onPickDay={(d) => { setCursor(new Date(d)); setView('day'); }} />
            <div className="rounded-xl border border-border bg-white p-3">
              <div className="text-[10px] font-bold tracking-widest text-text3 uppercase mb-2">Próximas</div>
              {upcoming.length === 0 ? (
                <div className="text-[11.5px] text-text3">Sin citas próximas.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {upcoming.map((a) => {
                    const st = new Date(a.start_at);
                    const est = estadoOf(a);
                    const isToday = sameDay(st, today);
                    return (
                      <button key={a.id} onClick={() => setSelected(a)}
                              className={`w-full text-left px-2.5 py-2 rounded-[10px] border cursor-pointer transition-all duration-150 ${isToday ? 'border-[#F5D9A8] bg-[#FFFBF2]' : 'border-border/70 bg-white hover:border-[#F59E0B]/45'}`}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-surface2 text-text2 capitalize">
                            {isToday ? 'Hoy' : st.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })} · {timeHM(st)}
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: est.bar }} />
                        </div>
                        <div className="text-[12px] font-bold truncate mt-1">{a.title}</div>
                        <div className="text-[10.5px] text-text3 truncate">{apptName(a)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <DisponibilidadCard />
          </div>

          {/* Grilla horaria / vista mensual */}
          <div className="flex-1 min-w-0 rounded-[14px] border border-border bg-white overflow-hidden">
            {view === 'month' ? (
              <MonthGrid cursor={cursor} items={items}
                         onPickDay={(d) => { setCursor(new Date(d)); setView('day'); }}
                         onPickCita={(a) => setSelected(a)} />
            ) : (<>
            {/* Cabecera de días */}
            <div className="flex border-b border-border">
              <div className="w-[52px] shrink-0" />
              {days.map((d, i) => {
                const isToday = sameDay(d, today);
                return (
                  <div key={dateISO(d)} className="flex-1 text-center py-2">
                    <div className={`text-[9.5px] font-bold tracking-widest ${isToday ? 'text-[#B45309]' : 'text-text3'}`}>
                      {view === 'day' ? d.toLocaleDateString('es-AR', { weekday: 'long' }).toUpperCase() : DAY_LABELS[i]}
                    </div>
                    <div className="mt-0.5 flex justify-center">
                      <span className={`w-[26px] h-[26px] rounded-full text-[13px] font-bold flex items-center justify-center ${isToday ? 'bg-[#F59E0B] text-white' : 'text-text'}`}>
                        {d.getDate()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Cuerpo con líneas horarias */}
            <div ref={gridRef} className="flex relative" style={{ height: hours.length * HOUR_PX }}>
              <div className="w-[52px] shrink-0 relative">
                {hours.map((h, i) => (
                  <span key={h} className={`absolute right-2 text-[9.5px] text-text3 ${i === 0 ? 'translate-y-[2px]' : '-translate-y-1/2'}`}
                        style={{ top: i * HOUR_PX }}>
                    {pad(h)}:00
                  </span>
                ))}
              </div>
              {days.map((d) => {
                const isToday = sameDay(d, today);
                const isSunday = d.getDay() === 0;
                const citas = byDay[dateISO(d)] || [];
                return (
                  <div key={dateISO(d)} className="flex-1 relative border-l border-surface2"
                       style={{
                         background: isToday ? '#FFFBF2'
                           : isSunday ? 'repeating-linear-gradient(45deg, transparent, transparent 7px, rgba(226,229,235,0.35) 7px, rgba(226,229,235,0.35) 8px)'
                           : undefined,
                         backgroundImage: !isToday && !isSunday
                           ? `repeating-linear-gradient(to bottom, transparent, transparent ${HOUR_PX - 1}px, #F0F2F5 ${HOUR_PX - 1}px, #F0F2F5 ${HOUR_PX}px)`
                           : undefined,
                       }}>
                    {(isToday || isSunday) && (
                      <div className="absolute inset-0 pointer-events-none"
                           style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${HOUR_PX - 1}px, rgba(240,242,245,0.9) ${HOUR_PX - 1}px, rgba(240,242,245,0.9) ${HOUR_PX}px)` }} />
                    )}
                    {citas.map((a) => {
                      const est = estadoOf(a);
                      return (
                        <button key={a.id} onClick={() => setSelected(a)}
                                className="absolute left-1 right-1 rounded-lg text-left px-2 py-1 cursor-pointer overflow-hidden transition-all duration-150 hover:brightness-[0.98]"
                                style={{ ...blockStyle(a), background: est.bg, border: `1px solid ${est.border}`, borderLeft: `3px solid ${est.bar}` }}>
                          <div className="text-[10px] font-bold" style={{ color: est.color }}>{timeHM(new Date(a.start_at))}</div>
                          <div className="text-[10.5px] font-semibold truncate text-text">{a.title}</div>
                          <div className="text-[9.5px] truncate text-text3">{apptName(a)}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {/* Línea de "ahora" */}
              {showNowLine && (
                <div className="absolute left-[52px] right-0 pointer-events-none z-10" style={{ top: nowOffset }}>
                  <div className="h-[2px] bg-[#EF4444] relative">
                    <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-[#EF4444]" />
                  </div>
                </div>
              )}
            </div>
            </>)}
          </div>
        </div>
      </div>

      {/* ════ MOBILE ════ */}
      <div className="hidden max-md:flex flex-col gap-3 px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[18px] font-extrabold">Citas</div>
            <div className="text-[11.5px] text-text3 capitalize">
              {mobileDay.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
            </div>
          </div>
          <button onClick={goToday}
                  className="h-8 px-3 rounded-[10px] border border-border bg-white text-[12px] font-semibold text-text2 cursor-pointer">
            Hoy
          </button>
        </div>

        {/* Tira semanal */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMobileDay((p) => { const d = new Date(p); d.setDate(d.getDate() - 7); return d; })}
                  className="w-7 h-7 rounded-lg border border-border bg-white text-text2 flex items-center justify-center shrink-0">
            <ChevronLeft size={13} />
          </button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {mobileWeek.map((d) => {
              const active = sameDay(d, mobileDay);
              const isToday = sameDay(d, today);
              const has = mobileItems.some((a) => sameDay(new Date(a.start_at), d));
              return (
                <button key={dateISO(d)} onClick={() => setMobileDay(new Date(d))}
                        className={`rounded-xl border py-1.5 flex flex-col items-center gap-0.5 cursor-pointer transition-all duration-150 ${active ? 'border-[#F5D9A8] bg-[#FEF0D7]' : 'border-border/70 bg-white'}`}>
                  <span className={`text-[8.5px] font-bold ${active ? 'text-[#B45309]' : 'text-text3'}`}>{DAY_LABELS[(d.getDay() + 6) % 7]}</span>
                  <span className={`text-[13px] font-bold ${active ? 'text-[#B45309]' : isToday ? 'text-[#F59E0B]' : 'text-text'}`}>{d.getDate()}</span>
                  <span className={`w-1 h-1 rounded-full ${has ? 'bg-[#22C55E]' : 'bg-transparent'}`} />
                </button>
              );
            })}
          </div>
          <button onClick={() => setMobileDay((p) => { const d = new Date(p); d.setDate(d.getDate() + 7); return d; })}
                  className="w-7 h-7 rounded-lg border border-border bg-white text-text2 flex items-center justify-center shrink-0">
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Agenda del día */}
        {mobileDayCitas.length === 0 ? (
          <div className="text-center py-10 px-6 rounded-2xl border border-dashed border-border bg-white">
            <CalendarDays size={24} className="mx-auto text-text3 mb-2" />
            <div className="text-[12.5px] font-semibold text-text2">Sin citas este día</div>
            <div className="text-[11px] text-text3 mt-1">Tocá + para agendar una.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mobileDayCitas.map((a) => {
              const est = estadoOf(a);
              const st = new Date(a.start_at);
              return (
                <button key={a.id} onClick={() => setSelected(a)}
                        className="w-full text-left rounded-2xl border border-border/70 bg-white p-3 flex items-center gap-3 cursor-pointer">
                  <span className="self-stretch w-[3px] rounded-full shrink-0" style={{ background: est.bar }} />
                  <span className="text-[14px] font-extrabold shrink-0 w-[46px]">{timeHM(st)}</span>
                  <span className="flex-1 min-w-0 leading-tight">
                    <span className="block text-[13px] font-bold truncate">{a.title}</span>
                    <span className="block text-[11px] text-text3 truncate">{apptName(a)}</span>
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: est.bg, color: est.color }}>
                    {est.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* FAB nueva cita */}
        <button onClick={() => setNuevaOpen(true)}
                className="fixed bottom-[84px] right-4 w-12 h-12 rounded-full border-0 bg-[#F59E0B] text-white shadow-[0_4px_14px_rgba(245,158,11,.45)] flex items-center justify-center cursor-pointer z-30">
          <Plus size={22} />
        </button>
      </div>

      {selected && <CitaModal appt={selected} onClose={() => setSelected(null)} onChanged={load} />}
      <NuevaCitaModal open={nuevaOpen} onClose={() => setNuevaOpen(false)} onCreated={load} />
    </div>
  );
}

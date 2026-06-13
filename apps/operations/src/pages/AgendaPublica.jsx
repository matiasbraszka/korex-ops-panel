import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@korex/db';

// Agenda pública (/agendar) — flujo de reserva tipo Calendly en 3 pasos.
// Diseño: design_handoff_agenda_publica (azul de marca #4878FF, Montserrat
// para títulos, copy en TÚ neutro). Sin login: la valida agenda-publica
// (edge function) contra la disponibilidad configurada en el panel.

const BLUE = '#4878FF';
const MONTSERRAT = { fontFamily: "'Montserrat', 'Inter', sans-serif" };

const DIALS = [
  ['+54', '🇦🇷 +54'], ['+52', '🇲🇽 +52'], ['+57', '🇨🇴 +57'], ['+56', '🇨🇱 +56'],
  ['+51', '🇵🇪 +51'], ['+593', '🇪🇨 +593'], ['+598', '🇺🇾 +598'], ['+595', '🇵🇾 +595'],
  ['+591', '🇧🇴 +591'], ['+58', '🇻🇪 +58'], ['+507', '🇵🇦 +507'], ['+506', '🇨🇷 +506'],
  ['+503', '🇸🇻 +503'], ['+502', '🇬🇹 +502'], ['+504', '🇭🇳 +504'], ['+1809', '🇩🇴 +1 809'],
  ['+1', '🇺🇸 +1'], ['+34', '🇪🇸 +34'],
];

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;

// Íconos SVG inline (estilo Lucide, como el diseño).
const Icon = {
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
  video: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m15 10 7-3v10l-7-3" /></svg>,
  bell: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
  calendar: (size = 16) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>,
  calendarPlus: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="13" x2="12" y2="17" /><line x1="10" y1="15" x2="14" y2="15" /></svg>,
  check: (color = '#16A34A', size = 30, width = 2.5) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>,
};

function StepDot({ n, step }) {
  const done = step > n;
  const active = step === n;
  return (
    <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold"
          style={done
            ? { background: '#DCFCE7', color: '#16A34A' }
            : active
              ? { background: BLUE, color: '#fff' }
              : { background: '#fff', color: '#98A2B3', boxShadow: 'inset 0 0 0 1.5px #E2E5EB' }}>
      {done ? '✓' : n}
    </span>
  );
}

export default function AgendaPublica() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  // Calendario elegido por la URL: /agendar/<slug> (sin slug = el principal).
  const slug = useMemo(() => {
    const m = window.location.pathname.match(/^\/agendar\/([a-z0-9-]{1,60})\/?$/i);
    return m ? m[1].toLowerCase() : null;
  }, []);
  const [step, setStep] = useState(1);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [monthsData, setMonthsData] = useState({}); // {key: {days, configured}}
  const [eventMeta, setEventMeta] = useState(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [selDate, setSelDate] = useState(null); // 'YYYY-MM-DD'
  const [time, setTime] = useState(null);
  const [calCollapsed, setCalCollapsed] = useState(false); // mobile: tira semanal
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dial, setDial] = useState('+54');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState({}); // { [questionId]: value }
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(null);

  // Zona horaria del visitante: los horarios se muestran en SU hora local
  // (el backend los calcula en hora de Argentina y acá los convertimos).
  const visitorTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires'; }
    catch { return 'America/Argentina/Buenos_Aires'; }
  }, []);
  const sameAsArg = useMemo(() => { try { return new Date().getTimezoneOffset() === 180; } catch { return true; } }, []);
  const tzLabel = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat('es-AR', { timeZone: visitorTz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
      return parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-3';
    } catch { return 'GMT-3'; }
  }, [visitorTz]);
  const fmtLocalTime = useMemo(
    () => new Intl.DateTimeFormat('es-AR', { timeZone: visitorTz, hour: '2-digit', minute: '2-digit', hour12: false }),
    [visitorTz],
  );
  // Hora local del visitante para un slot argentino (date 'YYYY-MM-DD', time 'HH:MM').
  const localTime = useCallback((argDate, argTime) => {
    if (!argDate || !argTime) return argTime || '';
    try { return fmtLocalTime.format(new Date(`${argDate}T${argTime}:00-03:00`)); }
    catch { return argTime; }
  }, [fmtLocalTime]);
  const tzNote = sameAsArg
    ? '🇦🇷 Horarios en hora de Argentina (GMT-3)'
    : `🕐 Horarios en tu hora local (${tzLabel})`;

  // ── Slots del mes (cacheados por mes) ──
  const loadMonth = useCallback(async (m, force = false) => {
    const key = monthKey(m);
    if (!force && monthsData[key]) return;
    setLoadingMonth(true);
    try {
      const { data, error: err } = await supabase.functions.invoke('agenda-publica', {
        body: { action: 'slots', year: m.getFullYear(), month: m.getMonth(), slug },
      });
      if (err || !data?.ok) throw err || new Error(data?.error);
      setMonthsData((prev) => ({ ...prev, [key]: { days: data.days || {}, configured: data.configured } }));
      if (data.event) setEventMeta(data.event);
    } catch (e) {
      console.error('agenda: fallo la carga de horarios', e);
      setMonthsData((prev) => ({ ...prev, [key]: { days: {}, configured: true, failed: true } }));
    } finally {
      setLoadingMonth(false);
    }
  }, [monthsData]);

  useEffect(() => { loadMonth(month); }, [month, loadMonth]);

  const cur = monthsData[monthKey(month)] || { days: {}, configured: true };
  const slotMinutes = eventMeta?.slot_minutes || 30;
  const windowDays = eventMeta?.booking_window_days || 60;
  const instructions = Array.isArray(eventMeta?.confirm_instructions) ? eventMeta.confirm_instructions : [];

  // ── Calendario ──
  const y = month.getFullYear();
  const m = month.getMonth();
  const blanks = (new Date(y, m, 1).getDay() + 6) % 7;
  const totalDays = new Date(y, m + 1, 0).getDate();
  const monthLabel = cap(month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
  const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  // El último mes navegable depende de la ventana de reserva del calendario.
  const maxDate = new Date(today); maxDate.setDate(today.getDate() + windowDays);
  const maxMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const prevOk = month > minMonth;
  const nextOk = month < maxMonth;

  const pickDay = (key) => { setSelDate(key); setTime(null); setCalCollapsed(true); };

  const dayLabel = selDate
    ? cap(new Date(`${selDate}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))
    : '';
  const slots = selDate ? (cur.days[selDate] || []) : [];

  // Semana del día elegido (tira mobile).
  const weekDays = useMemo(() => {
    if (!selDate) return [];
    const d = new Date(`${selDate}T12:00:00`);
    const start = new Date(d);
    start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      return x;
    });
  }, [selDate]);

  // ── Formulario ──
  const phoneDigits = phone.replace(/\D/g, '');
  const questions = useMemo(() => (Array.isArray(eventMeta?.questions) ? eventMeta.questions : []), [eventMeta]);
  const requiredOk = useMemo(
    () => questions.filter((q) => q.required).every((q) => String(answers[q.id] || '').trim()),
    [questions, answers],
  );
  const setAnswer = (id, value) => setAnswers((prev) => ({ ...prev, [id]: value }));
  const canSubmit = name.trim().length > 1 && email.includes('@') && phoneDigits.length >= 6 && requiredOk && !booking;

  const submit = async () => {
    if (booking) return;
    if (!(name.trim().length > 1 && email.includes('@') && phoneDigits.length >= 6)) {
      setError('Completa nombre, email y WhatsApp para confirmar.');
      return;
    }
    if (!requiredOk) {
      setError('Por favor respondé las preguntas obligatorias.');
      return;
    }
    setError('');
    setBooking(true);
    try {
      const answersPayload = questions
        .map((q) => ({ id: q.id, value: String(answers[q.id] || '').trim() }))
        .filter((a) => a.value);
      const { data, error: err } = await supabase.functions.invoke('agenda-publica', {
        body: {
          action: 'book', date: selDate, time, name: name.trim(), email: email.trim(),
          dial, phone, answers: answersPayload, tz: visitorTz, slug,
        },
      });
      const code = data?.error || (err ? 'network' : null);
      if (!data?.ok) {
        if (code === 'slot_taken') {
          setError('');
          setTime(null);
          setStep(1);
          loadMonth(month, true);
          alert('Ese horario se acaba de ocupar. Elige otro, por favor.');
        } else if (code === 'too_many') {
          setError('Ya tienes reuniones agendadas con este número. Escríbenos por WhatsApp si necesitas cambiarlas.');
        } else {
          setError('No pudimos confirmar la reunión. Inténtalo de nuevo en un minuto.');
        }
        return;
      }
      setBooked(data);
      setStep(3);
    } catch {
      setError('No pudimos confirmar la reunión. Inténtalo de nuevo en un minuto.');
    } finally {
      setBooking(false);
    }
  };

  // Botón "Agregar a Google Calendar" (URL de plantilla pública).
  const gcalUrl = useMemo(() => {
    if (!booked?.event) return '#';
    const fmt = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: booked.event.title || 'Reunión',
      dates: `${fmt(booked.event.start_at)}/${fmt(booked.event.end_at)}`,
      details: 'El link de Zoom te llegó por email y WhatsApp.',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }, [booked]);

  const reset = () => {
    setStep(1); setSelDate(null); setTime(null); setCalCollapsed(false);
    setName(''); setEmail(''); setDial('+54'); setPhone(''); setAnswers({});
    setError(''); setBooked(null);
    loadMonth(month, true);
  };

  const inputCls = 'h-12 border-[1.5px] border-[#E2E5EB] rounded-xl px-3.5 text-[14px] outline-none transition-colors duration-150 focus:border-[#4878FF] w-full bg-white';

  return (
    <div className="min-h-[100vh] flex flex-col items-center bg-[#F5F5F7] text-[#1A2233] px-[clamp(10px,3vw,24px)] py-[clamp(12px,3vw,48px)]"
         style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`
        @keyframes stepIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      <div className="w-full max-w-[1020px] bg-white border border-[#E8EBF0] rounded-[20px] shadow-[0_12px_32px_rgba(10,22,40,.08),0_4px_12px_rgba(10,22,40,.05)] flex flex-wrap overflow-hidden my-auto">

        {/* ── Panel de marca ── */}
        <div className="flex-[1_1_280px] min-w-0 bg-[#FAFBFC] border-b border-[#F0F2F5] p-[clamp(20px,4vw,34px)] flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/mk-logo.svg" alt="Método Korex" className="w-[34px] h-[34px]" />
            <span className="text-[11px] font-bold tracking-[0.18em] text-[#667085]">MÉTODO KOREX</span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="m-0 font-extrabold leading-[1.1] tracking-[-0.03em] text-[clamp(22px,3.2vw,30px)]" style={MONTSERRAT}>
              {eventMeta?.title || 'Reunión'}
            </h1>
            <p className="m-0 text-[13.5px] leading-[1.55] text-[#5D6678]">{eventMeta?.description || ''}</p>
          </div>

          <div className="flex flex-col gap-2.5 mt-0.5">
            {[
              [Icon.clock, `${slotMinutes} minutos`],
              [Icon.video, 'Por Zoom · el link te llega al instante'],
              [Icon.bell, 'Recordatorio por WhatsApp 24 h antes'],
            ].map(([icon, label], i) => (
              <span key={i} className="flex items-center gap-[9px] text-[13px] text-[#3D4659] font-medium">
                <span className="w-7 h-7 rounded-lg bg-[#EEF3FF] flex items-center justify-center shrink-0">{icon}</span>
                {label}
              </span>
            ))}
          </div>

          <div className="flex-1" />

          {/* Anfitrión: solo si el calendario lo definió (con su foto si la tiene). */}
          {eventMeta?.host_name && (
            <div className="flex items-center gap-[11px] border-t border-[#F0F2F5] pt-4">
              {eventMeta.host_avatar ? (
                <img src={eventMeta.host_avatar} alt={eventMeta.host_name}
                     className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-10 h-10 rounded-full text-white text-[13px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #4878FF, #8B5CF6)' }}>
                  {eventMeta.host_name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="flex flex-col leading-[1.3]">
                <span className="text-[13px] font-bold">{eventMeta.host_name}</span>
                {eventMeta.host_role && <span className="text-[11.5px] text-[#98A2B3]">{eventMeta.host_role}</span>}
              </span>
            </div>
          )}
        </div>

        {/* ── Área de pasos ── */}
        <div className="flex-[1.7_1_340px] min-w-0 p-[clamp(18px,4vw,34px)] flex flex-col gap-[18px]">

          {/* indicador */}
          <div className="flex items-center gap-2 flex-wrap">
            {[[1, 'Horario'], [2, 'Tus datos'], [3, 'Confirmado']].map(([n, label], i) => (
              <span key={n} className="flex items-center gap-2">
                {i > 0 && <span className="w-[18px] h-[1.5px] bg-[#E2E5EB] inline-block" />}
                <span className="flex items-center gap-1.5">
                  <StepDot n={n} step={step} />
                  <span className="text-[11.5px] font-semibold text-[#3D4659]">{label}</span>
                </span>
              </span>
            ))}
          </div>

          {/* ════ PASO 1 ════ */}
          {step === 1 && (
            <div className="flex flex-col gap-3.5" style={{ animation: 'stepIn .25s ease' }}>
              <span className="text-[15px] font-bold">Elige día y horario</span>

              <div className="flex flex-wrap gap-[22px]">
                {/* calendario (mobile: colapsa a tira semanal tras elegir día) */}
                <div className={`flex-[1.3_1_280px] min-w-0 flex-col gap-2.5 ${calCollapsed && selDate ? 'hidden md:flex' : 'flex'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold flex-1">{monthLabel}</span>
                    {[['‹', prevOk, -1], ['›', nextOk, 1]].map(([sym, ok, delta]) => (
                      <button key={sym} disabled={!ok}
                              onClick={() => ok && setMonth((p) => new Date(p.getFullYear(), p.getMonth() + delta, 1))}
                              className={`w-8 h-8 rounded-[10px] border border-[#E2E5EB] bg-white text-[16px] leading-none transition-all duration-150 ${ok ? 'text-[#3D4659] cursor-pointer hover:bg-[#FAFBFC]' : 'text-[#D0D5DD] cursor-default'}`}>
                        {sym}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-[5px] text-[10.5px] font-bold text-[#98A2B3] text-center" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                    {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((l, i) => <span key={i}>{l}</span>)}
                  </div>
                  <div className="grid gap-[5px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                    {Array.from({ length: blanks }).map((_, i) => <span key={`b${i}`} />)}
                    {Array.from({ length: totalDays }, (_, i) => {
                      const d = i + 1;
                      const key = dateKey(y, m, d);
                      const available = Boolean(cur.days[key]?.length);
                      const selected = selDate === key;
                      const isToday = key === dateKey(today.getFullYear(), today.getMonth(), today.getDate());
                      return (
                        <button key={key} disabled={!available}
                                onClick={() => available && pickDay(key)}
                                className="h-10 min-h-10 max-md:h-11 max-md:min-h-11 rounded-xl border-0 text-[13.5px] p-0 transition-all duration-150"
                                style={selected
                                  ? { background: BLUE, color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 10px rgba(72,120,255,.35)' }
                                  : available
                                    ? { background: '#EEF3FF', color: '#3461D9', fontWeight: 600, cursor: 'pointer', ...(isToday ? { boxShadow: `inset 0 0 0 1.5px ${BLUE}` } : {}) }
                                    : { background: 'transparent', color: '#C3C9D4', cursor: 'default' }}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-[#98A2B3] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#EEF3FF] border-[1.5px] border-[#4878FF] inline-block" />
                    {loadingMonth ? 'Cargando horarios…' : 'Días con horarios disponibles · zona horaria Argentina (GMT-3)'}
                  </span>
                  {!cur.configured && !loadingMonth && (
                    <span className="text-[12px] text-[#98A2B3]">Por ahora no hay horarios publicados. Vuelve a intentarlo más tarde.</span>
                  )}
                </div>

                {/* tira semanal (solo mobile, con día elegido) */}
                {calCollapsed && selDate && (
                  <div className="md:hidden w-full flex flex-col gap-2">
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                      {weekDays.map((d) => {
                        const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
                        const available = Boolean(cur.days[key]?.length || (monthsData[monthKey(d)]?.days || {})[key]?.length);
                        const active = key === selDate;
                        return (
                          <button key={key} disabled={!available}
                                  onClick={() => available && pickDay(key)}
                                  className="rounded-xl border-0 py-2 flex flex-col items-center gap-0.5 transition-all duration-150"
                                  style={active
                                    ? { background: BLUE, color: '#fff', cursor: 'pointer' }
                                    : available
                                      ? { background: '#EEF3FF', color: '#3461D9', cursor: 'pointer' }
                                      : { background: 'transparent', color: '#C3C9D4' }}>
                            <span className="text-[9px] font-bold">{['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'][(d.getDay() + 6) % 7]}</span>
                            <span className="text-[14px] font-bold">{d.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => setCalCollapsed(false)}
                            className="self-start border-0 bg-transparent text-[12px] font-bold cursor-pointer p-1" style={{ color: BLUE }}>
                      Ver mes completo
                    </button>
                  </div>
                )}

                {/* horarios */}
                <div className="flex-[1_1_210px] min-w-0 flex flex-col gap-2.5 max-md:pb-16">
                  {selDate ? (
                    <>
                      <span className="text-[13px] font-bold">{dayLabel}</span>
                      <span className="text-[11.5px] text-[#98A2B3] -mt-1.5">{tzNote}</span>
                      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] max-md:grid-cols-2">
                        {slots.map((t) => {
                          const selected = time === t;
                          return (
                            <div key={t} className="flex gap-2">
                              <button onClick={() => setTime(t)}
                                      className="flex-1 h-[46px] min-h-[46px] max-md:h-12 rounded-xl text-[14px] font-semibold cursor-pointer transition-all duration-150"
                                      style={selected
                                        ? { background: '#3D4659', border: 0, color: '#fff' }
                                        : { background: '#fff', border: '1.5px solid #C8D6FF', color: '#3461D9' }}>
                                {localTime(selDate, t)}
                              </button>
                              {selected && (
                                <button onClick={() => { setStep(2); setError(''); }}
                                        className="flex-1 h-[46px] border-0 rounded-xl text-[14px] font-bold text-white cursor-pointer shadow-[0_4px_12px_rgba(72,120,255,.35)] max-md:hidden"
                                        style={{ background: BLUE, animation: 'popIn .18s ease' }}>
                                  Siguiente
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {slots.length === 0 && !loadingMonth && (
                          <span className="text-[12.5px] text-[#98A2B3]">Ese día ya no tiene horarios libres.</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="border-[1.5px] border-dashed border-[#E2E5EB] rounded-[14px] px-4 py-[22px] text-center text-[12.5px] text-[#98A2B3] leading-[1.5] md:mt-[26px]">
                      Elige un día del calendario para ver los horarios libres.
                    </div>
                  )}
                </div>
              </div>

              {/* CTA fijo mobile */}
              {time && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8EBF0] p-3 z-50"
                     style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
                  <button onClick={() => { setStep(2); setError(''); }}
                          className="w-full h-[52px] border-0 rounded-[14px] text-[15px] font-bold text-white cursor-pointer shadow-[0_4px_12px_rgba(72,120,255,.35)]"
                          style={{ background: BLUE }}>
                    Siguiente — {dayLabel.split(',')[0]} {selDate?.slice(8)}, {localTime(selDate, time)}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════ PASO 2 ════ */}
          {step === 2 && (
            <div className="flex flex-col gap-3.5 max-md:pb-20" style={{ animation: 'stepIn .25s ease' }}>
              {/* resumen */}
              <div className="flex items-center gap-2.5 bg-[#EEF3FF] border border-[#C8D6FF] rounded-[14px] px-3.5 py-3">
                <span className="w-[34px] h-[34px] rounded-[10px] bg-white flex items-center justify-center shrink-0">{Icon.calendar()}</span>
                <span className="flex-1 min-w-0 leading-[1.35]">
                  <span className="block text-[13px] font-bold">{dayLabel} · {localTime(selDate, time)}</span>
                  <span className="block text-[11.5px] text-[#5D6678]">{slotMinutes} min · Zoom · {sameAsArg ? 'hora Argentina' : 'tu hora local'} ({tzLabel})</span>
                </span>
                <button onClick={() => setStep(1)}
                        className="border-0 bg-transparent text-[12px] font-bold cursor-pointer p-1.5" style={{ color: BLUE }}>
                  Cambiar
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-[5px]">
                  <span className="text-[12px] font-semibold text-[#3D4659]">Nombre y apellido</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre"
                         autoCapitalize="words" className={inputCls + ' max-md:h-[50px]'} />
                </label>
                <label className="flex flex-col gap-[5px]">
                  <span className="text-[12px] font-semibold text-[#3D4659]">Email</span>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@email.com" type="email"
                         className={inputCls + ' max-md:h-[50px]'} />
                </label>
                <label className="flex flex-col gap-[5px]">
                  <span className="text-[12px] font-semibold text-[#3D4659]">WhatsApp</span>
                  <div className="flex gap-2">
                    <select value={dial} onChange={(e) => setDial(e.target.value)}
                            className="h-12 max-md:h-[50px] shrink-0 border-[1.5px] border-[#E2E5EB] rounded-xl px-2.5 text-[14px] font-semibold outline-none bg-white cursor-pointer transition-colors duration-150 focus:border-[#4878FF]">
                      {DIALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input value={phone}
                           onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ''))}
                           placeholder={dial === '+54' ? '11 2345 6789' : 'Tu número'}
                           type="tel" inputMode="numeric"
                           className={inputCls + ' flex-1 min-w-0 max-md:h-[50px]'} />
                  </div>
                  <span className="text-[11px] text-[#98A2B3]">
                    {dial === '+54'
                      ? 'Sin el 0 ni el 15. Ahí te enviamos el link de la reunión y el recordatorio.'
                      : 'Ahí te enviamos el link de la reunión y el recordatorio.'}
                  </span>
                </label>
                {/* Preguntas configurables del calendario */}
                {questions.map((q) => (
                  <label key={q.id} className="flex flex-col gap-[5px]">
                    <span className="text-[12px] font-semibold text-[#3D4659]">
                      {q.label}{' '}
                      {!q.required && <span className="font-normal text-[#98A2B3]">(opcional)</span>}
                    </span>
                    {q.type === 'select' ? (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((opt) => {
                          const sel = answers[q.id] === opt;
                          return (
                            <button key={opt} type="button"
                                    onClick={() => setAnswer(q.id, sel && !q.required ? '' : opt)}
                                    className="h-11 px-3.5 rounded-xl text-[13.5px] font-semibold cursor-pointer transition-all duration-150"
                                    style={sel
                                      ? { background: BLUE, color: '#fff', border: '1.5px solid ' + BLUE }
                                      : { background: '#fff', color: '#3461D9', border: '1.5px solid #C8D6FF' }}>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea value={answers[q.id] || ''} onChange={(e) => setAnswer(q.id, e.target.value)} rows={3}
                                placeholder="Escribe tu respuesta…"
                                className="border-[1.5px] border-[#E2E5EB] rounded-xl px-3.5 py-3 text-[14px] outline-none resize-none transition-colors duration-150 focus:border-[#4878FF] w-full leading-[1.5]" />
                    )}
                  </label>
                ))}
              </div>

              {error && <span className="text-[12px] font-semibold text-[#DC2626]">{error}</span>}

              <button onClick={submit}
                      className="h-[50px] border-0 rounded-xl text-[15px] font-bold transition-all duration-150 w-full max-md:hidden"
                      style={canSubmit
                        ? { background: BLUE, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(72,120,255,.35)' }
                        : { background: '#EEF0F4', color: '#98A2B3', cursor: 'default' }}>
                {booking ? 'Confirmando…' : 'Confirmar reunión'}
              </button>
              <span className="text-[11.5px] text-[#98A2B3] text-center leading-[1.5]">Al confirmar te llega el link de Zoom por email y WhatsApp.</span>

              {/* CTA fijo mobile */}
              <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8EBF0] p-3 z-50"
                   style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
                <button onClick={submit}
                        className="w-full h-[52px] border-0 rounded-[14px] text-[15px] font-bold transition-all duration-150"
                        style={canSubmit
                          ? { background: BLUE, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(72,120,255,.35)' }
                          : { background: '#EEF0F4', color: '#98A2B3', cursor: 'default' }}>
                  {booking ? 'Confirmando…' : 'Confirmar reunión'}
                </button>
              </div>
            </div>
          )}

          {/* ════ PASO 3 ════ */}
          {step === 3 && (
            <div className="flex flex-col items-center gap-3.5 text-center py-[clamp(8px,2vw,24px)]" style={{ animation: 'stepIn .25s ease' }}>
              <span className="w-16 h-16 rounded-full bg-[#DCFCE7] flex items-center justify-center" style={{ animation: 'popIn .3s ease' }}>
                {Icon.check()}
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="m-0 font-extrabold tracking-[-0.02em] text-[clamp(20px,3vw,26px)]" style={MONTSERRAT}>¡Reunión confirmada!</h2>
                <span className="text-[13.5px] text-[#5D6678]">Te esperamos, <b>{name.trim().split(' ')[0] || 'ahí'}</b>.</span>
              </div>

              <div className="w-full max-w-[420px] border border-[#E8EBF0] rounded-2xl p-4 flex flex-col gap-3 text-left">
                <span className="flex items-center gap-2.5">
                  <span className="w-[34px] h-[34px] rounded-[10px] bg-[#EEF3FF] flex items-center justify-center shrink-0">{Icon.calendar()}</span>
                  <span className="leading-[1.35]">
                    <span className="block text-[13.5px] font-bold">{dayLabel} · {localTime(selDate, time)} <span className="font-semibold text-[11.5px] text-[#5D6678]">({sameAsArg ? 'hora Argentina' : 'tu hora local'}, {tzLabel})</span></span>
                    <span className="block text-[11.5px] text-[#5D6678]">{eventMeta?.title || 'Reunión'} · {slotMinutes} min{eventMeta?.host_name ? ` · con ${eventMeta.host_name}` : ''}</span>
                  </span>
                </span>
                <a href={gcalUrl} target="_blank" rel="noopener noreferrer"
                   className="h-12 rounded-xl text-white flex items-center justify-center gap-2 text-[14px] font-bold no-underline shadow-[0_4px_12px_rgba(72,120,255,.35)]"
                   style={{ background: BLUE }}>
                  {Icon.calendarPlus}
                  Agregar a Google Calendar
                </a>
              </div>

              {instructions.length > 0 && (
                <div className="w-full max-w-[420px] bg-[#FAFBFC] border border-[#F0F2F5] rounded-2xl p-4 flex flex-col gap-2.5 text-left">
                  <span className="text-[13px] font-bold">¿Cómo asistir a la reunión?</span>
                  {instructions.map((t, i) => (
                    <span key={i} className="flex gap-[9px] text-[12.5px] text-[#5D6678] leading-[1.55]">
                      <span className="shrink-0 mt-0.5">{Icon.check(BLUE, 14, 2.25)}</span>
                      <span>{t}</span>
                    </span>
                  ))}
                </div>
              )}

              <span className="text-[12px] text-[#98A2B3] leading-[1.6] max-w-[380px]">
                Te enviamos el link a <b className="text-[#5D6678]">{email}</b> y por WhatsApp al{' '}
                <b className="text-[#5D6678]">{dial} {phone}</b>. Te recordamos 24 h antes.
              </span>

              <button onClick={reset}
                      className="border-0 bg-transparent text-[12.5px] font-bold cursor-pointer p-1.5" style={{ color: BLUE }}>
                Agendar otra reunión
              </button>
            </div>
          )}
        </div>
      </div>

      <span className="text-[11px] text-[#98A2B3] mt-3.5 flex items-center gap-1.5">
        <img src="/mk-logo.svg" alt="" className="w-3.5 h-3.5 opacity-70" />
        Agenda de Método Korex
      </span>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Copy, Plus, Trash2, X } from 'lucide-react';
import {
  fetchBookingCalendars, createBookingCalendar, updateBookingCalendar, fetchSoporteTeam,
} from '../lib/api.js';
import { initials as initialsOf, colorFromString } from '../lib/format.js';
import TimeSelect from './TimeSelect.jsx';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const emptyWeek = () => { const d = {}; for (let i = 0; i < 7; i++) d[i] = { enabled: false, ranges: [] }; return d; };
// Convierte la disponibilidad guardada del calendario al formato de edición.
function weekFromAvailability(av) {
  const w = emptyWeek();
  for (let i = 0; i < 7; i++) {
    const day = av?.days?.[i] || av?.days?.[String(i)];
    if (!day) continue;
    let ranges = Array.isArray(day.ranges) ? day.ranges.filter((r) => r?.from && r?.to) : [];
    if (!ranges.length && day.from && day.to) ranges = [{ from: day.from, to: day.to }];
    w[i] = { enabled: Boolean(day.enabled), ranges: ranges.map((r) => ({ ...r })) };
  }
  return w;
}
const weekHasEnabled = (w) => Object.values(w).some((d) => d.enabled && d.ranges.length);
// Semana de edición → jsonb para guardar (solo franjas válidas).
function availabilityPayload(week) {
  const days = {};
  for (let i = 0; i < 7; i++) {
    const d = week[i] || { enabled: false, ranges: [] };
    const ranges = (d.ranges || []).filter((r) => r.from && r.to && r.to > r.from);
    days[i] = { enabled: Boolean(d.enabled && ranges.length), ranges };
  }
  return { days };
}

// Los 11 colores oficiales de evento de Google Calendar (colorId → hex).
export const GCAL_COLORS = [
  { id: '11', hex: '#D50000', name: 'Tomato' },
  { id: '4', hex: '#E67C73', name: 'Flamingo' },
  { id: '6', hex: '#F4511E', name: 'Tangerine' },
  { id: '5', hex: '#F6BF26', name: 'Banana' },
  { id: '2', hex: '#33B679', name: 'Sage' },
  { id: '10', hex: '#0B8043', name: 'Basil' },
  { id: '7', hex: '#039BE5', name: 'Peacock' },
  { id: '9', hex: '#3F51B5', name: 'Blueberry' },
  { id: '1', hex: '#7986CB', name: 'Lavender' },
  { id: '3', hex: '#8E24AA', name: 'Grape' },
  { id: '8', hex: '#616161', name: 'Graphite' },
];
export const gcalHex = (id) => GCAL_COLORS.find((c) => c.id === String(id))?.hex || '#039BE5';

// Colores de la etiqueta de motivo (chip): clave guardada en purpose_color.
export const TAG_COLORS = {
  amber: { bg: '#FEF0D7', text: '#B45309' },
  indigo: { bg: '#EEF2FF', text: '#4A67D8' },
  green: { bg: '#F0FDF4', text: '#15803D' },
  blue: { bg: '#EFF6FF', text: '#2563EB' },
  purple: { bg: '#F5F3FF', text: '#7C3AED' },
  rose: { bg: '#FFF1F2', text: '#E11D48' },
  gray: { bg: '#F1F3F5', text: '#5D6678' },
};
const TAG_COLOR_KEYS = Object.keys(TAG_COLORS);
const tagColor = (key) => TAG_COLORS[key] || TAG_COLORS.amber;

const DURACIONES = [15, 20, 30, 45, 60, 90];

const slugify = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

// ¿El miembro tiene al menos una franja habilitada cargada?
export const hasAvailability = (m) => {
  const days = m?.availability?.days || {};
  return Object.values(days).some((d) => d?.enabled &&
    ((Array.isArray(d.ranges) && d.ranges.length > 0) || (d.from && d.to)));
};

function MemberAvatar({ member, size = 32, ring = 'white' }) {
  const color = member.color || colorFromString(member.id || member.name);
  const borderStyle = ring ? `2px solid ${ring}` : undefined;
  if (member.avatar_url) {
    return (
      <img src={member.avatar_url} alt={member.name} title={member.name}
           className="rounded-full object-cover shrink-0"
           style={{ width: size, height: size, border: borderStyle }} />
    );
  }
  return (
    <span className="rounded-full flex items-center justify-center font-bold shrink-0"
          style={{ width: size, height: size, background: color + '1d', color, fontSize: size * 0.34, border: borderStyle }}>
      {member.initials || initialsOf(member.name)}
    </span>
  );
}

const DEFAULT_INSTRUCTIONS = [
  'Conéctate desde un lugar tranquilo, sin ruido de fondo, para dedicarle máxima atención a la reunión.',
  'Mantén la cámara encendida durante toda la reunión — la de todos los integrantes.',
  'Si tienes socios, también deben participar de la reunión; de lo contrario, deberemos cancelarla.',
];

const DEFAULT_CONFIRMATION = 'Hola {nombre}! Confirmamos tu reunión para el {fecha} a las {hora}{zona}. Cualquier cosa avisame por acá.';
const DEFAULT_REMINDERS = [
  { hours_before: 24, message: 'Hola {nombre}! Te recuerdo que mañana, el {fecha} a las {hora}, tenemos nuestra reunión. Te espero 👍' },
  { hours_before: 2, message: 'Hola {nombre}! En un rato, a las {hora}, tenemos nuestra reunión. Nos vemos ahí 👋' },
];

const NEW_DRAFT = {
  id: null, slug: '', name: '', purpose: 'Ventas', purpose_color: 'amber', duration_min: 30,
  gcal_title_template: '', gcal_color_id: '7', member_ids: [], active: true,
  description: '', host_member_id: '', host_role: '',
  questions: [{ id: 'q1', label: '¿Qué te gustaría resolver?', type: 'text', required: false, options: [] }],
  booking_window_days: 60, min_notice_hours: 2,
  confirm_instructions: [...DEFAULT_INSTRUCTIONS],
  confirmation_template: DEFAULT_CONFIRMATION,
  reminders: DEFAULT_REMINDERS.map((r) => ({ ...r })),
};

let qSeq = 0;
const newQuestionId = () => `q_${Date.now().toString(36)}_${++qSeq}`;

// Copia editable de un calendario (rellena los campos que pueden venir null).
function draftFromCal(cal) {
  const questions = Array.isArray(cal.questions) && cal.questions.length
    ? cal.questions.map((q) => ({
        id: q.id || newQuestionId(),
        label: q.label || '',
        type: q.type === 'select' ? 'select' : 'text',
        required: Boolean(q.required),
        options: Array.isArray(q.options) ? [...q.options] : [],
      }))
    : [];
  const availabilityDays = weekFromAvailability(cal.availability);
  return {
    ...cal,
    member_ids: [...(cal.member_ids || [])],
    purpose: cal.purpose || '',
    purpose_color: cal.purpose_color || 'amber',
    description: cal.description || '',
    host_member_id: cal.host_member_id || '',
    host_role: cal.host_role || '',
    questions,
    booking_window_days: cal.booking_window_days ?? 60,
    min_notice_hours: cal.min_notice_hours ?? 2,
    confirm_instructions: Array.isArray(cal.confirm_instructions) ? [...cal.confirm_instructions] : [],
    confirmation_template: cal.confirmation_template || '',
    reminders: Array.isArray(cal.reminders) ? cal.reminders.map((r) => ({ hours_before: r.hours_before, message: r.message || '' })) : [],
    use_own_hours: weekHasEnabled(availabilityDays),
    availabilityDays,
  };
}

// Draft nuevo (objetos frescos para no compartir referencias entre creaciones).
function freshDraft() {
  return {
    ...NEW_DRAFT,
    member_ids: [],
    questions: NEW_DRAFT.questions.map((q) => ({ ...q, options: [...q.options] })),
    confirm_instructions: [...DEFAULT_INSTRUCTIONS],
    use_own_hours: false,
    availabilityDays: emptyWeek(),
  };
}

// Chip de motivo: etiqueta personalizable (texto libre + color).
function PurposeChip({ label, color }) {
  const c = tagColor(color);
  if (!label) return null;
  return (
    <span className="text-[9px] font-bold tracking-[0.08em] px-2 py-0.5 rounded-full shrink-0 uppercase truncate max-w-[110px]"
          style={{ background: c.bg, color: c.text }}>
      {label}
    </span>
  );
}

function EstadoBadge({ active }) {
  return (
    <span className="ml-auto flex items-center gap-1 text-[10.5px] font-semibold"
          style={{ color: active ? '#15803D' : '#98A2B3' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#22C55E' : '#D0D5DD' }} />
      {active ? 'Activo' : 'Pausado'}
    </span>
  );
}

function membersLabel(cal, team) {
  const names = (cal.member_ids || [])
    .map((id) => team.find((m) => m.id === id)?.name?.split(' ')[0])
    .filter(Boolean);
  if (names.length === 0) return 'Sin equipo';
  if (names.length === 1) return `Sólo ${names[0]}`;
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names.length - 1} más`;
}

// Switch verde 34×20 del diseño.
function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!on)}
            className="relative w-[34px] h-5 rounded-full border-0 cursor-pointer transition-colors duration-150 shrink-0 disabled:cursor-default"
            style={{ background: on ? '#22C55E' : '#E2E5EB' }} disabled={disabled}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-150"
            style={on ? { right: 2 } : { left: 2 }} />
    </button>
  );
}

// Pestaña Calendarios: lista master-detail (330px) + editor, según
// design_handoff_citas/Citas - Calendarios.dc.html.
export default function CalendariosTab({ newSignal = 0, onConfigDisponibilidad, isAdmin }) {
  const [calendars, setCalendars] = useState([]);
  const [team, setTeam] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);

  useEffect(() => {
    Promise.all([fetchBookingCalendars(), fetchSoporteTeam()]).then(([cals, tm]) => {
      setCalendars(cals);
      setTeam(tm);
      setLoaded(true);
      if (cals.length) setSelId((prev) => prev || cals[0].id);
    }).catch((e) => console.error('soporte: fallo la carga de calendarios', e));
  }, []);

  // Botón "Nuevo calendario" del header de la página.
  useEffect(() => {
    if (newSignal > 0) {
      setSelId(null);
      setDraft(freshDraft());
      setMobileDetail(true);
      setError('');
    }
  }, [newSignal]);

  // Al elegir de la lista, el editor trabaja sobre una copia normalizada.
  useEffect(() => {
    if (!selId) return;
    const cal = calendars.find((c) => c.id === selId);
    if (cal) { setDraft(draftFromCal(cal)); setError(''); }
  }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectCal = (id) => { setSelId(id); setMobileDetail(true); };

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleMember = (id) => set({
    member_ids: draft.member_ids.includes(id)
      ? draft.member_ids.filter((x) => x !== id)
      : [...draft.member_ids, id],
  });

  // ── Constructor de preguntas del formulario ──
  const setQuestion = (idx, patch) => set({ questions: draft.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)) });
  const addQuestion = () => set({
    questions: [...draft.questions, { id: newQuestionId(), label: '', type: 'text', required: false, options: [] }],
  });
  const removeQuestion = (idx) => set({ questions: draft.questions.filter((_, i) => i !== idx) });
  const setOption = (qi, oi, val) => setQuestion(qi, { options: draft.questions[qi].options.map((o, i) => (i === oi ? val : o)) });
  const addOption = (qi) => setQuestion(qi, { options: [...draft.questions[qi].options, ''] });
  const removeOption = (qi, oi) => setQuestion(qi, { options: draft.questions[qi].options.filter((_, i) => i !== oi) });

  // ── Instrucciones de la página de confirmación ──
  const setInstruction = (i, val) => set({ confirm_instructions: draft.confirm_instructions.map((s, j) => (j === i ? val : s)) });
  const addInstruction = () => set({ confirm_instructions: [...draft.confirm_instructions, ''] });
  const removeInstruction = (i) => set({ confirm_instructions: draft.confirm_instructions.filter((_, j) => j !== i) });

  // ── Mensajes y seguimientos ──
  const setReminder = (i, patch) => set({ reminders: draft.reminders.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addReminder = () => set({ reminders: [...draft.reminders, { hours_before: 1, message: '' }] });
  const removeReminder = (i) => set({ reminders: draft.reminders.filter((_, j) => j !== i) });

  // ── Franjas horarias propias del calendario ──
  const setAvailDay = (i, patch) => set({ availabilityDays: { ...draft.availabilityDays, [i]: { ...draft.availabilityDays[i], ...patch } } });
  const toggleAvailDay = (i, on) => setAvailDay(i, {
    enabled: on,
    ranges: on && !draft.availabilityDays[i].ranges.length ? [{ from: '09:00', to: '18:00' }] : draft.availabilityDays[i].ranges,
  });
  const setAvailRange = (i, idx, range) => setAvailDay(i, { ranges: draft.availabilityDays[i].ranges.map((r, j) => (j === idx ? range : r)) });
  const addAvailRange = (i) => setAvailDay(i, { enabled: true, ranges: [...draft.availabilityDays[i].ranges, { from: '09:00', to: '13:00' }] });
  const removeAvailRange = (i, idx) => {
    const ranges = draft.availabilityDays[i].ranges.filter((_, j) => j !== idx);
    setAvailDay(i, { ranges, enabled: ranges.length ? draft.availabilityDays[i].enabled : false });
  };

  const uniqueSlug = (name, ownId) => {
    const base = slugify(name) || 'calendario';
    let slug = base;
    let n = 2;
    while (calendars.some((c) => c.slug === slug && c.id !== ownId)) slug = `${base}-${n++}`;
    return slug;
  };

  const publicPath = (slug) => `/agendar/${slug}`;
  const publicUrl = (slug) => `${window.location.origin}${publicPath(slug)}`;

  const copyLink = (slug) => {
    navigator.clipboard?.writeText(publicUrl(slug)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    setError('');
    if (!draft.name || draft.name.trim().length < 2) { setError('Poné un nombre para el calendario.'); return; }
    if (!draft.member_ids.length) { setError('Marcá al menos una persona del equipo.'); return; }
    // Preguntas válidas: con texto y, si son de opciones, con al menos una.
    const cleanQuestions = draft.questions
      .map((q) => ({
        id: q.id || newQuestionId(),
        label: q.label.trim(),
        type: q.type === 'select' ? 'select' : 'text',
        required: Boolean(q.required),
        options: q.type === 'select' ? q.options.map((o) => o.trim()).filter(Boolean) : [],
      }))
      .filter((q) => q.label && (q.type === 'text' || q.options.length > 0));
    const badSelect = draft.questions.find((q) => q.type === 'select' && q.label.trim() && q.options.filter((o) => o.trim()).length === 0);
    if (badSelect) { setError(`La pregunta "${badSelect.label.trim()}" es de opciones pero no tiene ninguna cargada.`); return; }

    const slug = draft.slug || uniqueSlug(draft.name, draft.id);
    // El anfitrión es un miembro del equipo; guardamos también su nombre.
    const hostMember = team.find((m) => m.id === draft.host_member_id);
    const payload = {
      slug,
      name: draft.name.trim(),
      purpose: draft.purpose?.trim() || 'Reunión',
      purpose_color: draft.purpose_color || 'amber',
      duration_min: draft.duration_min,
      gcal_title_template: draft.gcal_title_template?.trim() || `${draft.name.trim()} — {nombre}`,
      gcal_color_id: draft.gcal_color_id,
      member_ids: draft.member_ids,
      active: draft.active,
      host_member_id: draft.host_member_id || null,
      host_name: hostMember?.name || null,
      description: draft.description?.trim() || null,
      host_role: draft.host_role?.trim() || null,
      questions: cleanQuestions,
      booking_window_days: Math.min(365, Math.max(1, Number(draft.booking_window_days) || 60)),
      min_notice_hours: Math.min(168, Math.max(0, Number(draft.min_notice_hours) || 0)),
      confirm_instructions: draft.confirm_instructions.map((s) => s.trim()).filter(Boolean),
      // Franjas propias del calendario: null si no se usan (toma solo las del equipo).
      availability: draft.use_own_hours ? availabilityPayload(draft.availabilityDays) : null,
      // Mensajes: confirmación + seguimientos (limpios y ordenados).
      confirmation_template: draft.confirmation_template?.trim() || null,
      reminders: draft.reminders
        .map((r) => ({ hours_before: Math.max(1, Math.round(Number(r.hours_before) || 0)), message: r.message.trim() }))
        .filter((r) => r.hours_before > 0 && r.message)
        .sort((a, b) => b.hours_before - a.hours_before),
    };
    setSaving(true);
    try {
      if (draft.id) {
        const updated = await updateBookingCalendar(draft.id, payload);
        setCalendars((prev) => prev.map((c) => (c.id === draft.id ? { ...c, ...(updated || payload) } : c)));
        if (updated) setDraft(draftFromCal(updated));
      } else {
        const created = await createBookingCalendar(payload);
        if (created?.id) {
          setCalendars((prev) => [...prev, created]);
          setSelId(created.id);
        }
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      console.error('soporte: fallo el guardado del calendario', e);
      setError('No se pudo guardar. ¿Tenés permiso de administrador?');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (draft?.id) {
      const cal = calendars.find((c) => c.id === draft.id);
      if (cal) setDraft(draftFromCal(cal));
    } else {
      setDraft(null);
      setMobileDetail(false);
      if (calendars.length) setSelId(calendars[0].id);
    }
    setError('');
  };

  const toggleActive = async (on) => {
    set({ active: on });
    if (draft?.id) {
      try {
        await updateBookingCalendar(draft.id, { active: on });
        setCalendars((prev) => prev.map((c) => (c.id === draft.id ? { ...c, active: on } : c)));
      } catch { /* el guardar general lo persiste igual */ }
    }
  };

  const slugPreview = draft ? (draft.slug || slugify(draft.name) || '…') : '';

  // ── Card de la lista (desktop y mobile comparten contenido) ──
  const ListCard = ({ cal, mobile }) => {
    const selected = !mobile && cal.id === selId && draft?.id === cal.id;
    return (
      <button onClick={() => selectCal(cal.id)}
              className={`w-full text-left rounded-xl cursor-pointer flex flex-col gap-[7px] transition-all duration-150 ${mobile ? 'p-3.5 border border-border bg-white' : 'p-[13px_14px] border'} ${
                selected
                  ? 'border-[#F59E0B]/65 bg-[#FFFBF2] shadow-[0_2px_10px_rgba(245,158,11,0.10)]'
                  : mobile ? '' : 'border-border/80 bg-white hover:border-[#F59E0B]/40 hover:shadow-[0_2px_8px_rgba(10,22,40,0.06)]'
              } ${cal.active ? '' : 'opacity-75'}`}>
        <span className="flex items-center gap-2">
          <span className="w-[10px] h-[10px] rounded-[3px] shrink-0" style={{ background: gcalHex(cal.gcal_color_id) }} title="Color en Google Calendar" />
          <span className={`text-[13px] flex-1 truncate ${selected ? 'font-bold' : 'font-semibold'}`}>{cal.name}</span>
          <PurposeChip label={cal.purpose} color={cal.purpose_color} />
          {mobile && <ChevronRight size={14} className="text-text3 shrink-0" />}
        </span>
        <span className="text-[11.5px] text-text2">{cal.duration_min} min · Zoom</span>
        <span className="flex items-center gap-1.5">
          <span className="flex">
            {(cal.member_ids || []).slice(0, 4).map((id, i) => {
              const m = team.find((t) => t.id === id);
              if (!m) return null;
              return (
                <span key={id} style={i > 0 ? { marginLeft: -7 } : undefined}>
                  <MemberAvatar member={m} size={22} ring={selected ? '#FFFBF2' : '#FFFFFF'} />
                </span>
              );
            })}
          </span>
          <span className="text-[10.5px] text-text3 truncate">{membersLabel(cal, team)}</span>
          <EstadoBadge active={cal.active} />
        </span>
      </button>
    );
  };

  // ── Editor (desktop y mobile) — se invoca como función (no como <Editor/>)
  // para no remontar los inputs en cada tecleo (perderían el foco). ──
  const Editor = ({ mobile } = {}) => {
    if (!draft) return (
      <div className="flex-1 flex items-center justify-center text-[12.5px] text-text3 p-8 text-center">
        {loaded && calendars.length === 0
          ? 'Todavía no hay calendarios. Creá el primero con "Nuevo calendario".'
          : 'Elegí un calendario de la lista para editarlo.'}
      </div>
    );
    return (
      <div className={`flex flex-col ${mobile ? 'gap-3.5 px-4 pt-3.5 pb-4' : 'gap-[18px] p-[18px_22px] flex-1 min-w-0 overflow-y-auto'}`}>
        {/* Header del editor: color + nombre + URL + activo */}
        {!mobile && (
          <span className="flex items-center gap-2.5 flex-wrap">
            <span className="w-3 h-3 rounded shrink-0" style={{ background: gcalHex(draft.gcal_color_id) }} />
            <span className="text-[14px] font-bold">{draft.name || 'Nuevo calendario'}</span>
            <span className="text-[11px] text-text3">{window.location.host}/agendar/<b className="text-text2">{slugPreview}</b></span>
            {draft.slug && (
              <button onClick={() => copyLink(draft.slug)} title="Copiar link público"
                      className="bg-transparent border-0 cursor-pointer p-0 text-text3 hover:text-[#B45309] flex items-center">
                {copied ? <Check size={13} className="text-[#15803D]" /> : <Copy size={13} />}
              </button>
            )}
            {draft.slug && (
              <a href={publicPath(draft.slug)} target="_blank" rel="noopener noreferrer"
                 className="text-[11px] font-semibold text-[#4A67D8] no-underline hover:underline">
                Ver página pública →
              </a>
            )}
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: draft.active ? '#15803D' : '#98A2B3' }}>
                {draft.active ? 'Activo' : 'Pausado'}
              </span>
              <Toggle on={draft.active} onChange={toggleActive} disabled={!isAdmin} />
            </span>
          </span>
        )}
        {mobile && draft.slug && (
          <span className="flex items-center gap-1.5 text-[11.5px] text-text3">
            {window.location.host}/agendar/<b className="text-text2">{slugPreview}</b>
            <button onClick={() => copyLink(draft.slug)} className="bg-transparent border-0 cursor-pointer p-0 text-text3 flex items-center">
              {copied ? <Check size={12} className="text-[#15803D]" /> : <Copy size={12} />}
            </button>
            <a href={publicPath(draft.slug)} target="_blank" rel="noopener noreferrer"
               className="ml-auto text-[11px] font-semibold text-[#4A67D8] no-underline">Ver página pública →</a>
          </span>
        )}

        {/* Datos generales */}
        <div className={`flex flex-col gap-3 ${mobile ? '' : 'border border-surface2 rounded-[14px] p-4'}`}>
          {!mobile && <span className="text-[10px] font-bold tracking-[0.1em] text-text3">DATOS GENERALES</span>}
          {mobile && <span className="text-[12px] font-semibold text-[#3D4659]">Datos generales</span>}
          <div className={mobile ? 'flex flex-col gap-3.5' : 'grid gap-2.5'} style={mobile ? undefined : { gridTemplateColumns: '1fr 1fr 160px' }}>
            <label className="flex flex-col gap-[5px]">
              <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Nombre público</span>
              <input value={draft.name} onChange={(e) => set({ name: e.target.value })}
                     placeholder="Ej: Demo del sistema" disabled={!isAdmin}
                     className={`${mobile ? 'h-[46px] rounded-xl text-[13.5px]' : 'h-9 rounded-[10px] text-[12.5px]'} border border-border px-3 font-medium outline-none focus:border-[#F59E0B] transition-colors`} />
            </label>
            <div className={mobile ? 'grid grid-cols-[1fr_120px] gap-2.5' : 'contents'}>
              <label className="flex flex-col gap-[5px]">
                <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Motivo (etiqueta)</span>
                <input value={draft.purpose} onChange={(e) => set({ purpose: e.target.value })}
                       placeholder="Ej: Ventas, Onboarding…" disabled={!isAdmin} list="motivo-sugerencias"
                       className={`${mobile ? 'h-[46px] rounded-xl text-[13.5px]' : 'h-9 rounded-[10px] text-[12.5px]'} border border-border px-3 outline-none focus:border-[#F59E0B] transition-colors`} />
                <datalist id="motivo-sugerencias">
                  {['Ventas', 'Servicio', 'Onboarding', 'Seguimiento', 'Consultoría', 'Soporte'].map((s) => <option key={s} value={s} />)}
                </datalist>
                <span className="flex items-center gap-1.5 pt-0.5">
                  {TAG_COLOR_KEYS.map((k) => (
                    <button key={k} type="button" onClick={() => isAdmin && set({ purpose_color: k })}
                            title={k} className="w-5 h-5 rounded-full border-0 cursor-pointer transition-all duration-150"
                            style={{
                              background: TAG_COLORS[k].text,
                              boxShadow: draft.purpose_color === k ? `0 0 0 2px #fff, 0 0 0 4px ${TAG_COLORS[k].text}` : undefined,
                            }} />
                  ))}
                </span>
              </label>
              <label className="flex flex-col gap-[5px]">
                <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Duración</span>
                <select value={draft.duration_min} onChange={(e) => set({ duration_min: Number(e.target.value) })} disabled={!isAdmin}
                        className={`${mobile ? 'h-[46px] rounded-xl text-[13.5px]' : 'h-9 rounded-[10px] text-[12.5px]'} border border-border px-3 bg-white outline-none cursor-pointer`}>
                  {DURACIONES.map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </label>
            </div>
          </div>
          {/* Ventana de reserva + anticipación mínima */}
          <div className={mobile ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-2 gap-2.5 max-w-[420px]'}>
            <label className="flex flex-col gap-[5px]">
              <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Se puede agendar hasta</span>
              <span className="flex items-center gap-2">
                <input type="number" min={1} max={365} value={draft.booking_window_days}
                       onChange={(e) => set({ booking_window_days: e.target.value })} disabled={!isAdmin}
                       className={`${mobile ? 'h-[46px] rounded-xl text-[13.5px] w-[80px]' : 'h-9 rounded-[10px] text-[12.5px] w-[72px]'} border border-border px-3 outline-none focus:border-[#F59E0B] transition-colors`} />
                <span className="text-[12px] text-text2">días adelante</span>
              </span>
            </label>
            <label className="flex flex-col gap-[5px]">
              <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Anticipación mínima</span>
              <span className="flex items-center gap-2">
                <input type="number" min={0} max={168} value={draft.min_notice_hours}
                       onChange={(e) => set({ min_notice_hours: e.target.value })} disabled={!isAdmin}
                       className={`${mobile ? 'h-[46px] rounded-xl text-[13.5px] w-[80px]' : 'h-9 rounded-[10px] text-[12.5px] w-[72px]'} border border-border px-3 outline-none focus:border-[#F59E0B] transition-colors`} />
                <span className="text-[12px] text-text2">horas antes</span>
              </span>
            </label>
          </div>
        </div>

        {/* Textos de la página pública */}
        <div className={`flex flex-col gap-2.5 ${mobile ? '' : 'border border-surface2 rounded-[14px] p-4'}`}>
          {!mobile && <span className="text-[10px] font-bold tracking-[0.1em] text-text3">TEXTOS DE LA PÁGINA</span>}
          {mobile && <span className="text-[12px] font-semibold text-[#3D4659]">Textos de la página</span>}
          <label className="flex flex-col gap-[5px]">
            <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Descripción</span>
            <textarea value={draft.description || ''} onChange={(e) => set({ description: e.target.value })}
                      placeholder="Qué verá el prospecto bajo el título (ej: en qué consiste la reunión)."
                      rows={2} disabled={!isAdmin}
                      className={`${mobile ? 'rounded-xl text-[13.5px] py-2.5' : 'rounded-[10px] text-[12.5px] py-2'} border border-border px-3 outline-none focus:border-[#F59E0B] resize-y transition-colors`} />
          </label>
          <div className={mobile ? 'grid grid-cols-1 gap-3.5' : 'grid grid-cols-2 gap-3.5'}>
            <label className="flex flex-col gap-[5px]">
              <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Anfitrión</span>
              <span className="flex items-center gap-2">
                {(() => {
                  const h = team.find((m) => m.id === draft.host_member_id);
                  return h ? <MemberAvatar member={h} size={mobile ? 30 : 28} ring={null} /> : null;
                })()}
                <select value={draft.host_member_id || ''} onChange={(e) => set({ host_member_id: e.target.value })} disabled={!isAdmin}
                        className={`flex-1 min-w-0 ${mobile ? 'h-[46px] rounded-xl text-[13.5px]' : 'h-9 rounded-[10px] text-[12.5px]'} border border-border px-3 bg-white outline-none cursor-pointer focus:border-[#F59E0B] transition-colors`}>
                  <option value="">Sin anfitrión visible</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </span>
              <span className="text-[10.5px] text-text3">Su nombre y foto aparecen en la página de reserva.</span>
            </label>
            <label className="flex flex-col gap-[5px]">
              <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Anfitrión (qué hace en la reunión)</span>
              <input value={draft.host_role || ''} onChange={(e) => set({ host_role: e.target.value })}
                     placeholder="Ej: Te muestra el sistema en vivo" disabled={!isAdmin}
                     className={`${mobile ? 'h-[46px] rounded-xl text-[13.5px]' : 'h-9 rounded-[10px] text-[12.5px]'} border border-border px-3 outline-none focus:border-[#F59E0B] transition-colors`} />
            </label>
          </div>
        </div>

        {/* Evento en Google Calendar */}
        <div className={`flex flex-col gap-2.5 ${mobile ? '' : 'border border-surface2 rounded-[14px] p-4'}`}>
          {!mobile && <span className="text-[10px] font-bold tracking-[0.1em] text-text3">EVENTO EN GOOGLE CALENDAR</span>}
          <div className={mobile ? 'flex flex-col gap-3.5' : 'grid grid-cols-2 gap-3.5'}>
            <label className="flex flex-col gap-[5px]">
              <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>
                {mobile ? 'Título en Google Calendar' : 'Título del evento'}
              </span>
              <input value={draft.gcal_title_template || ''} onChange={(e) => set({ gcal_title_template: e.target.value })}
                     placeholder={`${draft.name || 'Reunión'} — {nombre}`} disabled={!isAdmin}
                     className={`${mobile ? 'h-[46px] rounded-xl text-[13.5px]' : 'h-9 rounded-[10px] text-[12.5px]'} border border-border px-3 outline-none focus:border-[#F5D9A8] focus:shadow-[0_0_0_3px_rgba(245,158,11,0.07)] transition-all`} />
              <span className="text-[10.5px] text-text3">Puedes usar <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{nombre}'}</b> y <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{telefono}'}</b>.</span>
            </label>
            <label className="flex flex-col gap-[7px]">
              <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>
                {mobile ? 'Color en Google Calendar' : 'Color del evento'}
              </span>
              <span className={`flex flex-wrap ${mobile ? 'gap-[7px]' : 'gap-1.5 pt-1'}`}>
                {GCAL_COLORS.map((c) => (
                  <button key={c.id} title={c.name} onClick={() => isAdmin && set({ gcal_color_id: c.id })}
                          className={`border-0 cursor-pointer transition-all duration-150 ${mobile ? 'w-7 h-7 rounded-[9px]' : 'w-6 h-6 rounded-lg'}`}
                          style={{
                            background: c.hex,
                            boxShadow: String(draft.gcal_color_id) === c.id ? `0 0 0 2px #FFFFFF, 0 0 0 4px ${c.hex}` : undefined,
                          }} />
                ))}
              </span>
            </label>
          </div>
        </div>

        {/* Formulario de reserva */}
        <div className={`flex flex-col gap-2.5 ${mobile ? '' : 'border border-surface2 rounded-[14px] p-4'}`}>
          <span className="flex items-center justify-between">
            <span className={mobile ? 'text-[12px] font-semibold text-[#3D4659]' : 'text-[10px] font-bold tracking-[0.1em] text-text3'}>
              {mobile ? 'Preguntas al reservar' : 'FORMULARIO AL RESERVAR'}
            </span>
          </span>
          <span className="text-[11px] text-text3 -mt-1">
            Lo que le preguntamos al prospecto cuando agenda. Las de opciones sirven para etiquetar y enfocar la llamada.
          </span>
          <div className="flex flex-col gap-2.5">
            {draft.questions.map((q, qi) => (
              <div key={q.id} className="rounded-xl border border-border bg-surface2/40 p-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <input value={q.label} onChange={(e) => setQuestion(qi, { label: e.target.value })}
                         placeholder="Texto de la pregunta" disabled={!isAdmin}
                         className="flex-1 min-w-0 h-9 rounded-[10px] border border-border px-3 text-[12.5px] font-medium bg-white outline-none focus:border-[#F59E0B] transition-colors" />
                  {isAdmin && (
                    <button onClick={() => removeQuestion(qi)} title="Quitar pregunta"
                            className="bg-transparent border-0 cursor-pointer p-1.5 text-text3 hover:text-[#DC2626] shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Tipo: texto libre o lista de opciones */}
                  <span className="flex bg-surface2 rounded-lg p-0.5 h-8">
                    {[['text', 'Respuesta libre'], ['select', 'Opciones']].map(([id, label]) => (
                      <button key={id} onClick={() => isAdmin && setQuestion(qi, { type: id })}
                              className={`px-3 rounded-md text-[11.5px] border-0 cursor-pointer transition-all duration-150 ${
                                q.type === id ? 'bg-white font-bold text-[#B45309] shadow-[0_1px_2px_rgba(10,22,40,.08)]' : 'bg-transparent font-semibold text-text3'}`}>
                        {label}
                      </button>
                    ))}
                  </span>
                  <label className="flex items-center gap-1.5 text-[11.5px] font-medium text-text2 cursor-pointer">
                    <input type="checkbox" checked={q.required} disabled={!isAdmin}
                           onChange={(e) => setQuestion(qi, { required: e.target.checked })} className="cursor-pointer" />
                    Obligatoria
                  </label>
                </div>
                {/* Opciones (solo tipo select) */}
                {q.type === 'select' && (
                  <div className="flex flex-col gap-1.5 pl-1">
                    {q.options.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C8D6FF] shrink-0" />
                        <input value={o} onChange={(e) => setOption(qi, oi, e.target.value)}
                               placeholder={`Opción ${oi + 1}`} disabled={!isAdmin}
                               className="flex-1 min-w-0 h-8 rounded-lg border border-border px-2.5 text-[12px] bg-white outline-none focus:border-[#F59E0B] transition-colors" />
                        {isAdmin && (
                          <button onClick={() => removeOption(qi, oi)} className="bg-transparent border-0 cursor-pointer p-1 text-text3 hover:text-[#DC2626] shrink-0">
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    ))}
                    {isAdmin && (
                      <button onClick={() => addOption(qi)}
                              className="self-start mt-0.5 h-7 px-2.5 rounded-lg border border-dashed border-[#C8D6FF] bg-transparent text-[11.5px] font-semibold text-[#4A67D8] cursor-pointer hover:bg-[#EEF3FF] transition-colors">
                        + Opción
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {draft.questions.length === 0 && (
              <span className="text-[11.5px] text-text3 italic">Sin preguntas: el prospecto solo deja nombre, email y WhatsApp.</span>
            )}
            {isAdmin && draft.questions.length < 6 && (
              <button onClick={addQuestion}
                      className="self-start h-8 px-3 rounded-[10px] border border-dashed border-[#D0D5DD] bg-transparent text-[12px] font-semibold text-text3 cursor-pointer hover:border-[#F5D9A8] hover:text-[#B45309] transition-colors duration-150 flex items-center gap-1.5">
                <Plus size={13} /> Agregar pregunta
              </button>
            )}
          </div>
        </div>

        {/* Equipo involucrado */}
        <div className={`flex flex-col gap-2.5 ${mobile ? '' : 'border border-surface2 rounded-[14px] p-4'}`}>
          <span className="flex items-center justify-between">
            <span className={mobile ? 'text-[12px] font-semibold text-[#3D4659]' : 'text-[10px] font-bold tracking-[0.1em] text-text3'}>
              {mobile ? 'Equipo involucrado' : 'EQUIPO INVOLUCRADO'}
            </span>
            {!mobile && (
              <button onClick={() => onConfigDisponibilidad?.()}
                      className="bg-transparent border-0 cursor-pointer p-0 text-[11px] font-semibold text-[#B45309] hover:underline">
                Configurar disponibilidad por persona →
              </button>
            )}
          </span>
          <div className="flex flex-col gap-1.5">
            {team.map((m) => {
              const checked = draft.member_ids.includes(m.id);
              const connected = Boolean(m.email);
              return (
                <div key={m.id}
                     className={`flex items-center gap-[11px] rounded-xl border transition-all duration-150 ${mobile ? 'px-3 py-2.5' : 'px-3 py-2.5'} ${
                       checked ? 'border-[#F5D9A8] bg-[#FFFBF2]' : 'border-surface2 opacity-80'}`}>
                  <button onClick={() => isAdmin && toggleMember(m.id)} aria-label={`Incluir a ${m.name}`}
                          className={`w-[18px] h-[18px] rounded-md cursor-pointer flex items-center justify-center shrink-0 transition-all duration-150 ${
                            checked ? 'bg-[#F59E0B] border-0' : 'bg-white border-[1.5px] border-[#D0D5DD]'}`}>
                    {checked && <Check size={11} strokeWidth={3} className="text-white" />}
                  </button>
                  <MemberAvatar member={m} size={mobile ? 28 : 32} ring={null} />
                  <span className="flex-1 min-w-0 flex flex-col leading-[1.3]">
                    <span className={`font-semibold truncate ${mobile ? 'text-[13px]' : 'text-[12.5px]'}`}>{m.name}</span>
                    {!mobile && <span className="text-[10.5px] text-text3 truncate">{m.role || ''}</span>}
                  </span>
                  {connected ? (
                    mobile
                      ? <span className="w-[7px] h-[7px] rounded-full bg-[#22C55E] shrink-0" title="GCal conectado" />
                      : <span className="text-[10.5px] font-semibold text-[#15803D] flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />Google Calendar conectado
                        </span>
                  ) : (
                    mobile
                      ? <span className="w-[7px] h-[7px] rounded-full bg-[#F59E0B] shrink-0" title="Sin conectar" />
                      : <button onClick={() => onConfigDisponibilidad?.(m.id)}
                                className="bg-transparent border-0 cursor-pointer p-0 text-[10.5px] font-semibold text-[#B45309] flex items-center gap-1 shrink-0 hover:underline">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />Conectar Google Calendar
                        </button>
                  )}
                </div>
              );
            })}
          </div>
          <span className="text-[11px] text-text3">
            Sólo se ofrecen horarios donde todos los marcados están libres (su disponibilidad + su Google Calendar).
          </span>
        </div>

        {/* Horarios propios del calendario (opcional) */}
        <div className={`flex flex-col gap-2.5 ${mobile ? '' : 'border border-surface2 rounded-[14px] p-4'}`}>
          <span className="flex items-center gap-2.5">
            <span className={mobile ? 'text-[12px] font-semibold text-[#3D4659]' : 'text-[10px] font-bold tracking-[0.1em] text-text3'}>
              {mobile ? 'Horarios del calendario' : 'HORARIOS DEL CALENDARIO'}
            </span>
            <Toggle on={draft.use_own_hours} onChange={(on) => set({ use_own_hours: on })} disabled={!isAdmin} />
            <span className="text-[11px] font-semibold" style={{ color: draft.use_own_hours ? '#B45309' : '#98A2B3' }}>
              {draft.use_own_hours ? 'Franjas propias' : 'Usa las del equipo'}
            </span>
          </span>
          <span className="text-[11px] text-text3 -mt-1">
            {draft.use_own_hours
              ? 'Solo se ofrecen horarios dentro de estas franjas Y donde el equipo esté libre.'
              : 'Los horarios salen de la disponibilidad del equipo (su disponibilidad + su Google Calendar). Activá esto para acotarlos a franjas propias de este calendario.'}
          </span>
          {draft.use_own_hours && (
            <div className="flex flex-col">
              {DAY_NAMES.map((name, i) => {
                const d = draft.availabilityDays[i];
                return (
                  <div key={i} className={`flex items-start gap-3 py-2 ${i < 6 ? 'border-b border-surface2' : ''}`}>
                    <span className="flex items-center gap-2 shrink-0 w-[112px] pt-1">
                      <Toggle on={d.enabled} onChange={(on) => toggleAvailDay(i, on)} disabled={!isAdmin} />
                      <span className={`text-[12px] font-semibold ${d.enabled ? '' : 'text-text3'}`}>{name}</span>
                    </span>
                    {d.enabled ? (
                      <span className="flex flex-wrap gap-1.5 flex-1 items-center">
                        {d.ranges.map((r, idx) => (
                          <span key={idx} className="flex items-center gap-1.5">
                            <TimeSelect value={r.from} disabled={!isAdmin} onChange={(v) => setAvailRange(i, idx, { ...r, from: v })} />
                            <span className="text-text3">–</span>
                            <TimeSelect value={r.to} disabled={!isAdmin} onChange={(v) => setAvailRange(i, idx, { ...r, to: v })} />
                            {isAdmin && (
                              <button onClick={() => removeAvailRange(i, idx)} className="bg-transparent border-0 cursor-pointer p-0 text-text3 hover:text-[#DC2626] flex items-center">
                                <X size={12} strokeWidth={2.5} />
                              </button>
                            )}
                          </span>
                        ))}
                        {isAdmin && (
                          <button onClick={() => addAvailRange(i)}
                                  className="h-8 px-2.5 rounded-lg border border-dashed border-[#D0D5DD] bg-transparent text-[11.5px] font-semibold text-text3 cursor-pointer hover:border-[#F5D9A8] hover:text-[#B45309] transition-colors">
                            + franja
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="flex-1 text-[12px] text-text3 pt-1.5">Sin horario</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Instrucciones de la página de confirmación */}
        <div className={`flex flex-col gap-2.5 ${mobile ? '' : 'border border-surface2 rounded-[14px] p-4'}`}>
          <span className={mobile ? 'text-[12px] font-semibold text-[#3D4659]' : 'text-[10px] font-bold tracking-[0.1em] text-text3'}>
            {mobile ? 'Instrucciones al confirmar' : 'INSTRUCCIONES AL CONFIRMAR'}
          </span>
          <span className="text-[11px] text-text3 -mt-1">
            Lo que ve el prospecto en la pantalla final ("¿Cómo asistir a la reunión?"). Si lo dejás vacío, esa sección no aparece.
          </span>
          <div className="flex flex-col gap-1.5">
            {draft.confirm_instructions.map((ins, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#BBF7D0] shrink-0 mt-3" />
                <textarea value={ins} onChange={(e) => setInstruction(i, e.target.value)}
                          placeholder={`Instrucción ${i + 1}`} rows={2} disabled={!isAdmin}
                          className="flex-1 min-w-0 rounded-[10px] border border-border px-3 py-2 text-[12.5px] bg-white outline-none focus:border-[#F59E0B] resize-y transition-colors" />
                {isAdmin && (
                  <button onClick={() => removeInstruction(i)} className="bg-transparent border-0 cursor-pointer p-1.5 text-text3 hover:text-[#DC2626] shrink-0 mt-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {draft.confirm_instructions.length === 0 && (
              <span className="text-[11.5px] text-text3 italic">Sin instrucciones: la pantalla final no muestra "¿Cómo asistir?".</span>
            )}
            {isAdmin && draft.confirm_instructions.length < 10 && (
              <button onClick={addInstruction}
                      className="self-start h-8 px-3 rounded-[10px] border border-dashed border-[#D0D5DD] bg-transparent text-[12px] font-semibold text-text3 cursor-pointer hover:border-[#F5D9A8] hover:text-[#B45309] transition-colors duration-150 flex items-center gap-1.5">
                <Plus size={13} /> Agregar instrucción
              </button>
            )}
          </div>
        </div>

        {/* Mensajes y seguimientos por WhatsApp */}
        <div className={`flex flex-col gap-2.5 ${mobile ? '' : 'border border-surface2 rounded-[14px] p-4'}`}>
          <span className={mobile ? 'text-[12px] font-semibold text-[#3D4659]' : 'text-[10px] font-bold tracking-[0.1em] text-text3'}>
            {mobile ? 'Mensajes y seguimientos' : 'MENSAJES Y SEGUIMIENTOS'}
          </span>
          <label className="flex flex-col gap-[5px]">
            <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Mensaje al agendar (ni bien reserva)</span>
            <textarea value={draft.confirmation_template || ''} onChange={(e) => set({ confirmation_template: e.target.value })}
                      placeholder={DEFAULT_CONFIRMATION} rows={2} disabled={!isAdmin}
                      className="rounded-[10px] text-[12.5px] py-2 border border-border px-3 outline-none focus:border-[#F59E0B] resize-y transition-colors" />
            <span className="text-[10.5px] text-text3">Usás <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{nombre}'}</b> <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{fecha}'}</b> <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{hora}'}</b> <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{zona}'}</b>. El link de Zoom se agrega solo.</span>
          </label>

          <div className="flex flex-col gap-1.5 pt-1">
            <span className={`font-semibold ${mobile ? 'text-[12px] text-[#3D4659]' : 'text-[11px] text-text2'}`}>Seguimientos antes de la reunión</span>
            {draft.reminders.map((r, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface2/40 p-3 flex flex-col gap-2">
                <span className="flex items-center gap-2">
                  <input type="number" min={1} max={336} value={r.hours_before}
                         onChange={(e) => setReminder(i, { hours_before: e.target.value })} disabled={!isAdmin}
                         className="h-8 w-[68px] rounded-lg border border-border px-2.5 text-[12.5px] bg-white outline-none focus:border-[#F59E0B]" />
                  <span className="text-[12px] text-text2">horas antes</span>
                  {isAdmin && (
                    <button onClick={() => removeReminder(i)} className="ml-auto bg-transparent border-0 cursor-pointer p-1 text-text3 hover:text-[#DC2626]">
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
                <textarea value={r.message} onChange={(e) => setReminder(i, { message: e.target.value })}
                          placeholder="Texto del seguimiento…" rows={2} disabled={!isAdmin}
                          className="rounded-[10px] text-[12.5px] py-2 border border-border px-3 outline-none focus:border-[#F59E0B] resize-y transition-colors" />
              </div>
            ))}
            {draft.reminders.length === 0 && (
              <span className="text-[11.5px] text-text3 italic">Sin seguimientos: solo se manda el mensaje al agendar.</span>
            )}
            {isAdmin && draft.reminders.length < 6 && (
              <button onClick={addReminder}
                      className="self-start h-8 px-3 rounded-[10px] border border-dashed border-[#D0D5DD] bg-transparent text-[12px] font-semibold text-text3 cursor-pointer hover:border-[#F5D9A8] hover:text-[#B45309] transition-colors duration-150 flex items-center gap-1.5">
                <Plus size={13} /> Agregar seguimiento
              </button>
            )}
            <span className="text-[10.5px] text-text3">Cada seguimiento se manda una vez, esas horas antes de la reunión. Variables: <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{nombre}'}</b> <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{fecha}'}</b> <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{hora}'}</b> <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{'{zoom}'}</b>.</span>
          </div>
        </div>

        {error && <div className="text-[12px] font-medium" style={{ color: '#DC2626' }}>{error}</div>}

        {/* Footer desktop */}
        {!mobile && isAdmin && (
          <span className="flex items-center gap-2 justify-end">
            {savedFlash && (
              <span className="text-[12px] font-semibold text-[#15803D] flex items-center gap-1 mr-1">
                <Check size={13} strokeWidth={2.5} /> Cambios guardados
              </span>
            )}
            <button onClick={discard}
                    className="h-9 px-4 rounded-[10px] border border-border bg-white text-[12.5px] font-semibold text-text2 cursor-pointer hover:bg-surface2 transition-colors duration-150">
              Descartar
            </button>
            <button onClick={save} disabled={saving}
                    className="h-9 px-[18px] rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-semibold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-[7px] shadow-[0_2px_6px_rgba(245,158,11,.3)] transition-colors duration-150 disabled:opacity-60">
              <Check size={13} strokeWidth={2.5} /> {saving ? 'Guardando…' : 'Guardar calendario'}
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ── Desktop: master-detail ── */}
      <div className="max-md:hidden flex flex-1 min-h-0 items-stretch">
        <div className="w-[330px] shrink-0 border-r border-surface2 p-3.5 flex flex-col gap-2 overflow-y-auto">
          {!loaded ? (
            <div className="text-[12px] text-text3 p-2">Cargando…</div>
          ) : calendars.length === 0 ? (
            <div className="text-[12px] text-text3 p-2">Sin calendarios todavía.</div>
          ) : calendars.map((cal) => <ListCard key={cal.id} cal={cal} />)}
        </div>
        {Editor()}
      </div>

      {/* ── Mobile: lista → detalle apilados ── */}
      <div className="hidden max-md:flex flex-col flex-1 min-h-0">
        {!mobileDetail ? (
          <div className="flex flex-col gap-2 px-4 pt-3 pb-4 overflow-y-auto">
            {!loaded ? (
              <div className="text-[12px] text-text3 p-2">Cargando…</div>
            ) : calendars.length === 0 ? (
              <div className="text-[12px] text-text3 text-center py-8">Sin calendarios todavía. Tocá + para crear el primero.</div>
            ) : calendars.map((cal) => <ListCard key={cal.id} cal={cal} mobile />)}
          </div>
        ) : (
          <>
            {/* Header detalle: back + color + nombre + toggle */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-surface2 shrink-0">
              <button onClick={() => setMobileDetail(false)} className="bg-transparent border-0 cursor-pointer p-0 text-text2 flex items-center">
                <ArrowLeft size={20} />
              </button>
              <span className="w-[11px] h-[11px] rounded-[3.5px] shrink-0" style={{ background: gcalHex(draft?.gcal_color_id) }} />
              <span className="flex-1 text-[15px] font-extrabold tracking-[-0.01em] truncate">{draft?.name || 'Nuevo calendario'}</span>
              {draft && <Toggle on={draft.active} onChange={toggleActive} disabled={!isAdmin} />}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {Editor({ mobile: true })}
            </div>
            {/* CTA fijo */}
            {isAdmin && (
              <div className="shrink-0 px-4 pt-2 pb-2 border-t border-surface2 bg-white">
                {savedFlash && (
                  <div className="text-[12px] font-semibold text-[#15803D] flex items-center justify-center gap-1 pb-1.5">
                    <Check size={13} strokeWidth={2.5} /> Cambios guardados
                  </div>
                )}
                <button onClick={save} disabled={saving}
                        className="w-full h-[50px] rounded-[14px] border-0 bg-[#F59E0B] text-white text-[14.5px] font-bold cursor-pointer shadow-[0_2px_6px_rgba(245,158,11,.35)] disabled:opacity-60">
                  {saving ? 'Guardando…' : 'Guardar calendario'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { fetchSoporteTeam, updateTeamMember } from '../lib/api.js';
import { initials as initialsOf, colorFromString } from '../lib/format.js';
import { hasAvailability } from './CalendariosTab.jsx';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Normaliza la disponibilidad guardada al formato de edición:
// { 0..6: { enabled, ranges: [{from,to}] } } — soporta el formato viejo from/to.
function normalizeDays(availability) {
  const out = {};
  for (let i = 0; i < 7; i++) {
    const d = availability?.days?.[String(i)] || availability?.days?.[i];
    if (!d) { out[i] = { enabled: false, ranges: [] }; continue; }
    let ranges = Array.isArray(d.ranges) ? d.ranges.filter((r) => r?.from && r?.to) : [];
    if (!ranges.length && d.from && d.to) ranges = [{ from: d.from, to: d.to }];
    out[i] = { enabled: Boolean(d.enabled), ranges: ranges.map((r) => ({ ...r })) };
  }
  return out;
}

function toAvailability(days) {
  const out = {};
  for (let i = 0; i < 7; i++) {
    const d = days[i];
    out[i] = { enabled: Boolean(d.enabled && d.ranges.length), ranges: d.ranges.filter((r) => r.from && r.to && r.to > r.from) };
  }
  return { days: out };
}

function MemberAvatar({ member, size = 36 }) {
  const color = member.color || colorFromString(member.id || member.name);
  return (
    <span className="rounded-full flex items-center justify-center font-bold shrink-0"
          style={{ width: size, height: size, background: color + '1d', color, fontSize: size * 0.33 }}>
      {member.initials || initialsOf(member.name)}
    </span>
  );
}

// Toggle ámbar 30×18 del diseño (flex-shrink: 0).
function DayToggle({ on, onChange, disabled }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!on)}
            className="relative w-[30px] h-[18px] rounded-full border-0 cursor-pointer transition-colors duration-150 shrink-0"
            style={{ background: on ? '#F59E0B' : '#E2E5EB' }} disabled={disabled}>
      <span className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all duration-150"
            style={on ? { right: 2 } : { left: 2 }} />
    </button>
  );
}

// Chip de franja: dos inputs de hora editables + X para borrar.
function RangeChip({ range, onChange, onRemove, mobile, disabled }) {
  const inputCls = 'border-0 outline-none bg-transparent p-0 font-semibold cursor-pointer';
  return (
    <span className={`flex items-center border border-border ${mobile ? 'h-[30px] px-2.5 rounded-[9px] gap-1 text-[11.5px]' : 'h-8 px-3 rounded-[9px] gap-1.5 text-[12px]'}`}>
      <input type="time" value={range.from} disabled={disabled}
             onChange={(e) => onChange({ ...range, from: e.target.value })}
             className={inputCls} style={{ fontSize: 'inherit', width: mobile ? 58 : 62 }} />
      <span className="text-text3">–</span>
      <input type="time" value={range.to} disabled={disabled}
             onChange={(e) => onChange({ ...range, to: e.target.value })}
             className={inputCls} style={{ fontSize: 'inherit', width: mobile ? 58 : 62 }} />
      {!disabled && (
        <button onClick={onRemove} className="bg-transparent border-0 cursor-pointer p-0 text-text3 hover:text-[#DC2626] flex items-center ml-0.5">
          <X size={11} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

// Franja por defecto al agregar: después de la última, o 09:00–13:00.
function nextRange(ranges) {
  if (!ranges.length) return { from: '09:00', to: '13:00' };
  const last = ranges[ranges.length - 1];
  const [h] = last.to.split(':').map(Number);
  const from = `${String(Math.min(h + 1, 21)).padStart(2, '0')}:00`;
  const to = `${String(Math.min(h + 4, 23)).padStart(2, '0')}:00`;
  return { from, to };
}

// Pestaña Disponibilidad: horarios semanales por persona + su cuenta Google,
// según design_handoff_citas/Citas - Disponibilidad.dc.html.
export default function DisponibilidadTab({ initialMemberId, isAdmin }) {
  const [team, setTeam] = useState([]);
  const [selId, setSelId] = useState(initialMemberId || null);
  const [days, setDays] = useState(null);
  const [email, setEmail] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSoporteTeam().then((tm) => {
      setTeam(tm);
      setSelId((prev) => prev || initialMemberId || tm[0]?.id || null);
    }).catch((e) => console.error('soporte: fallo la carga del equipo', e));
  }, [initialMemberId]);

  useEffect(() => {
    if (initialMemberId) setSelId(initialMemberId);
  }, [initialMemberId]);

  const member = useMemo(() => team.find((m) => m.id === selId) || null, [team, selId]);

  // Al cambiar de persona, cargar su disponibilidad en el editor.
  useEffect(() => {
    if (!member) return;
    setDays(normalizeDays(member.availability));
    setEmail(member.email || '');
    setEditingEmail(!member.email);
    setError('');
  }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ¿Hay cambios sin guardar respecto de lo que está en la base?
  const dirty = useMemo(() => {
    if (!member || !days) return false;
    return JSON.stringify(toAvailability(days)) !== JSON.stringify(toAvailability(normalizeDays(member.availability)));
  }, [member, days]);

  // Cambiar de persona avisa si hay cambios sin guardar (causa típica de
  // "cargué los horarios y no se guardaron").
  const pickMember = (id) => {
    if (id === selId) return;
    if (dirty && !window.confirm(`Tenés cambios sin guardar de ${member?.name?.split(' ')[0] || 'esta persona'}. ¿Los descartamos?`)) return;
    setSelId(id);
  };

  const setDay = (i, patch) => setDays((prev) => ({ ...prev, [i]: { ...prev[i], ...patch } }));
  const setRange = (i, idx, range) => setDay(i, { ranges: days[i].ranges.map((r, j) => (j === idx ? range : r)) });
  const addRange = (i) => setDay(i, { enabled: true, ranges: [...days[i].ranges, nextRange(days[i].ranges)] });
  const removeRange = (i, idx) => {
    const ranges = days[i].ranges.filter((_, j) => j !== idx);
    setDay(i, { ranges, enabled: ranges.length > 0 ? days[i].enabled : false });
  };
  const toggleDay = (i, on) => setDay(i, {
    enabled: on,
    ranges: on && !days[i].ranges.length ? [{ from: '09:00', to: '18:00' }] : days[i].ranges,
  });

  const save = async () => {
    if (!member || !days) return;
    setError('');
    setSaving(true);
    try {
      const updated = await updateTeamMember(member.id, { availability: toAvailability(days) });
      if (updated) setTeam((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...updated } : m)));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      console.error('soporte: fallo el guardado de disponibilidad', e);
      setError('No se pudo guardar. ¿Tenés permiso de administrador?');
    } finally {
      setSaving(false);
    }
  };

  const saveEmail = async () => {
    if (!member) return;
    setError('');
    const clean = email.trim().toLowerCase();
    if (clean && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) { setError('Ese email no parece válido.'); return; }
    try {
      const updated = await updateTeamMember(member.id, { email: clean || null });
      if (updated) setTeam((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...updated } : m)));
      setEditingEmail(!clean);
    } catch (e) {
      console.error('soporte: fallo el guardado del email', e);
      setError('No se pudo guardar el email. ¿Tenés permiso de administrador?');
    }
  };

  // GcalCard y WeekEditor se invocan como funciones (no como <Componente/>)
  // para no remontar los inputs en cada tecleo (perderían el foco).
  // ── Card de conexión a Google Calendar (columna derecha / banner mobile) ──
  const GcalCard = () => {
    if (!member) return null;
    const connected = Boolean(member.email);
    return (
      <div className={`bg-white border rounded-[14px] p-3.5 flex flex-col gap-2 ${connected ? 'border-[#BBF7D0]' : 'border-[#F5D9A8]'}`}>
        <span className="flex items-center gap-2.5">
          <span className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0 ${connected ? 'bg-[#F0FDF4]' : 'bg-[#FEF0D7]'}`}>
            <Check size={15} strokeWidth={2.5} style={{ color: connected ? '#15803D' : '#B45309' }} />
          </span>
          <span className="flex flex-col leading-[1.3] min-w-0 flex-1">
            <span className="text-[12.5px] font-bold">{connected ? 'Conectado' : 'Sin conectar'}</span>
            {connected && !editingEmail && <span className="text-[11px] text-text3 truncate">{member.email}</span>}
          </span>
          {connected && !editingEmail && isAdmin && (
            <button onClick={() => setEditingEmail(true)}
                    className="bg-transparent border-0 cursor-pointer p-0 text-[11px] font-semibold text-text3 hover:text-text2 shrink-0">
              Reconectar
            </button>
          )}
        </span>
        {editingEmail && isAdmin && (
          <span className="flex items-center gap-1.5">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@metodokorex.com"
                   className="flex-1 min-w-0 h-8 px-2.5 text-[12px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
            <button onClick={saveEmail}
                    className="h-8 px-3 rounded-lg border-0 bg-[#F59E0B] text-white text-[11.5px] font-bold cursor-pointer hover:bg-[#E08C0B] shrink-0">
              Guardar
            </button>
          </span>
        )}
        <span className="text-[11px] text-text2 leading-[1.6]">
          Leemos los eventos ocupados para bloquear esos horarios en los calendarios públicos.
          Sólo creamos eventos cuando alguien reserva — no tocamos nada más.
        </span>
      </div>
    );
  };

  // ── Editor semanal (desktop y mobile) ──
  const WeekEditor = ({ mobile } = {}) => {
    if (!member || !days) return null;
    return (
      <div className="flex flex-col">
        {DAY_NAMES.map((name, i) => {
          const d = days[i];
          return (
            <div key={i} className={`flex items-center gap-3 ${mobile ? 'py-2.5' : 'py-[11px]'} ${i < 6 ? 'border-b' : ''}`}
                 style={{ borderColor: '#F7F8FA' }}>
              <span className={`flex items-center gap-2.5 shrink-0 ${mobile ? '' : 'w-[108px]'}`}>
                <DayToggle on={d.enabled} onChange={(on) => toggleDay(i, on)} disabled={!isAdmin} />
                <span className={`font-bold ${mobile ? 'w-[38px] text-[12px]' : 'text-[12.5px]'} ${d.enabled ? '' : 'text-text3'}`}>
                  {mobile ? DAY_SHORT[i] : name}
                </span>
              </span>
              {d.enabled ? (
                <span className="flex gap-1.5 flex-wrap flex-1 items-center">
                  {d.ranges.map((r, idx) => (
                    <RangeChip key={idx} range={r} mobile={mobile} disabled={!isAdmin}
                               onChange={(nr) => setRange(i, idx, nr)}
                               onRemove={() => removeRange(i, idx)} />
                  ))}
                  {isAdmin && (
                    mobile ? (
                      <button onClick={() => addRange(i)} className="bg-transparent border-0 cursor-pointer p-1 text-text3 hover:text-[#B45309] flex items-center ml-auto">
                        <Plus size={14} />
                      </button>
                    ) : (
                      <button onClick={() => addRange(i)}
                              className="h-8 px-[11px] rounded-[9px] border border-dashed border-[#D0D5DD] bg-transparent text-[12px] font-semibold text-text3 cursor-pointer hover:border-[#F5D9A8] hover:text-[#B45309] transition-colors duration-150">
                        + franja
                      </button>
                    )
                  )}
                </span>
              ) : (
                <span className={`flex-1 ${mobile ? 'text-[11.5px]' : 'text-[12px]'} text-text3`}>Sin agenda</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const SaveButton = ({ mobile } = {}) => !isAdmin ? null : (
    <button onClick={save} disabled={saving}
            className={mobile
              ? 'w-full h-[50px] rounded-[14px] border-0 bg-[#F59E0B] text-white text-[14.5px] font-bold cursor-pointer shadow-[0_2px_6px_rgba(245,158,11,.35)] disabled:opacity-60'
              : 'h-9 px-[18px] rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-semibold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-[7px] shadow-[0_2px_6px_rgba(245,158,11,.3)] transition-colors duration-150 disabled:opacity-60'}>
      {!mobile && <Check size={13} strokeWidth={2.5} />}
      {saving ? 'Guardando…' : savedFlash ? '✓ Guardado' : 'Guardar disponibilidad'}
    </button>
  );

  return (
    <>
      {/* ── Desktop: personas 280px | editor | Google Calendar 320px ── */}
      <div className="max-md:hidden flex flex-1 min-h-0 items-stretch">
        <div className="w-[280px] shrink-0 border-r border-surface2 p-3.5 flex flex-col gap-2 overflow-y-auto">
          <span className="text-[10px] font-bold tracking-[0.1em] text-text3 px-0.5 pb-0.5">EQUIPO</span>
          {team.map((m) => {
            const selected = m.id === selId;
            const sinDisp = !hasAvailability(m);
            return (
              <button key={m.id} onClick={() => pickMember(m.id)}
                      className={`w-full text-left p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 transition-all duration-150 ${
                        selected
                          ? 'border-[#F59E0B]/65 bg-[#FFFBF2] shadow-[0_2px_10px_rgba(245,158,11,0.10)]'
                          : 'border-border/80 bg-white hover:border-[#F59E0B]/40 hover:shadow-[0_2px_8px_rgba(10,22,40,0.06)]'
                      } ${sinDisp && !selected ? 'opacity-80' : ''}`}>
                <MemberAvatar member={m} size={36} />
                <span className="flex-1 min-w-0 flex flex-col leading-[1.3]">
                  <span className={`text-[13px] truncate ${selected ? 'font-bold' : 'font-semibold'}`}>{m.name}</span>
                  <span className="text-[10.5px] truncate" style={{ color: sinDisp ? '#B45309' : '#98A2B3' }}>
                    {sinDisp ? 'Sin disponibilidad configurada' : (m.role || '')}
                  </span>
                </span>
                <span className="w-2 h-2 rounded-full shrink-0"
                      title={m.email ? 'Google Calendar conectado' : 'Google Calendar sin conectar'}
                      style={{ background: m.email ? '#22C55E' : '#F59E0B' }} />
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto p-[18px_22px] flex flex-col gap-3.5">
          {member && (
            <span className="flex items-center gap-2.5">
              <span className="text-[14px] font-bold">Disponibilidad semanal — {member.name}</span>
              <span className="text-[11px] text-text3">zona horaria Argentina (GMT-3)</span>
            </span>
          )}
          {WeekEditor()}
          {error && <div className="text-[12px] font-medium" style={{ color: '#DC2626' }}>{error}</div>}
          <span className="flex items-center justify-end gap-2.5 pt-1">
            {dirty && <span className="text-[11.5px] font-semibold text-[#B45309]">● Cambios sin guardar</span>}
            {SaveButton()}
          </span>
        </div>

        <div className="w-[320px] shrink-0 border-l border-surface2 p-[18px] flex flex-col gap-3.5 overflow-y-auto" style={{ background: '#FAFBFC' }}>
          <span className="text-[10px] font-bold tracking-[0.1em] text-text3">GOOGLE CALENDAR</span>
          {GcalCard()}
        </div>
      </div>

      {/* ── Mobile: chips de persona + banner GCal + semana compacta + CTA fijo ── */}
      <div className="hidden max-md:flex flex-col flex-1 min-h-0">
        <div className="shrink-0 px-4 pt-3 flex gap-1.5 overflow-x-auto">
          {team.map((m) => {
            const selected = m.id === selId;
            return (
              <button key={m.id} onClick={() => pickMember(m.id)}
                      className={`flex items-center justify-center gap-[7px] py-2 px-3 rounded-xl border cursor-pointer shrink-0 transition-all duration-150 ${
                        selected ? 'border-[#F5D9A8] bg-[#FFFBF2]' : 'border-border bg-white'} ${!hasAvailability(m) && !selected ? 'opacity-70' : ''}`}>
                <MemberAvatar member={m} size={24} />
                <span className={`text-[12.5px] ${selected ? 'font-bold text-[#B45309]' : 'font-semibold text-text2'}`}>
                  {m.name.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>

        {member && (
          Boolean(member.email) && !editingEmail ? (
            <div className="shrink-0 mx-4 mt-3 flex items-center gap-2.5 px-3 py-2.5 border border-[#BBF7D0] rounded-xl bg-[#F0FDF4]">
              <Check size={14} strokeWidth={2.5} className="text-[#15803D] shrink-0" />
              <span className="text-[11.5px] text-[#15803D] font-semibold flex-1">Google Calendar conectado — bloquea sus eventos ocupados</span>
              {isAdmin && (
                <button onClick={() => setEditingEmail(true)} className="bg-transparent border-0 cursor-pointer p-0 text-[10.5px] font-semibold text-[#15803D]/70">
                  Editar
                </button>
              )}
            </div>
          ) : (
            <div className="shrink-0 mx-4 mt-3">
              {GcalCard()}
            </div>
          )
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-1.5">
          {WeekEditor({ mobile: true })}
          {error && <div className="text-[12px] font-medium py-2" style={{ color: '#DC2626' }}>{error}</div>}
        </div>

        <div className="shrink-0 px-4 pt-3 pb-2 border-t border-surface2 bg-white">
          {SaveButton({ mobile: true })}
        </div>
      </div>
    </>
  );
}

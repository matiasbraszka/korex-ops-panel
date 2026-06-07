import { useState, useEffect, useMemo, useRef } from 'react';
import { X, ChevronDown, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import { useApp } from '../../context/AppContext';
import { today, mondayOf, weekDatesOf, getBullets, serializeBullets } from '../../utils/helpers';
import BulletRows from './BulletRows';

function fmtDateLabel(dateStr) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  } catch { return dateStr; }
}

const INTERNAL_KEY = '__internal__';
const INTERNAL_LABEL = 'Korex – Interno';
const NO_DAY = '__none__';

// Editor del informe semanal segmentado por día. Cada bullet trae _day/_dayLabel
// (stampeados al auto-rellenar desde los diarios). Renderiza un bloque por día
// con su propio BulletRows; al editar/agregar/borrar reconstruye la lista plena
// preservando el orden de los días. Si los bullets no tienen día (ej. al editar
// un informe viejo) cae a un único editor sin encabezados.
function WeeklyBulletsByDay({ bullets, onChange, ...bulletProps }) {
  const list = Array.isArray(bullets) ? bullets : [];

  // Agrupar por día respetando el orden de aparición (lunes → viernes).
  const groups = [];
  const byDay = new Map();
  list.forEach(b => {
    const day = b._day || NO_DAY;
    if (!byDay.has(day)) {
      const g = { day, dayLabel: b._dayLabel || null, items: [] };
      byDay.set(day, g);
      groups.push(g);
    }
    byDay.get(day).items.push(b);
  });

  const onlyNoDay = groups.length <= 1 && (groups[0]?.day === NO_DAY || groups.length === 0);

  if (onlyNoDay) {
    return <BulletRows bullets={list} onChange={onChange} {...bulletProps} />;
  }

  const handleGroupChange = (group, nextSubset) => {
    // Los bullets nuevos del grupo heredan su día.
    const stamped = nextSubset.map(b => (
      b._day ? b : { ...b, ...(group.day !== NO_DAY ? { _day: group.day, _dayLabel: group.dayLabel } : {}) }
    ));
    const next = [];
    groups.forEach(g => { next.push(...(g.day === group.day ? stamped : g.items)); });
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {groups.map(group => (
        <div key={group.day} className="border-l-2 border-gray-200 pl-2.5">
          <div className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            {group.day === NO_DAY ? 'Otros' : (group.dayLabel || group.day)}
          </div>
          <BulletRows
            bullets={group.items}
            onChange={(next) => handleGroupChange(group, next)}
            {...bulletProps}
          />
        </div>
      ))}
    </div>
  );
}

export default function CrearInformeModal({ open, onClose, defaultType = 'daily', editingReport = null }) {
  const { clients, currentUser, addTeamReport, updateTeamReport, appSettings, teamReports, tasks: tasksFromContext } = useApp();
  const isEditing = !!editingReport;
  // Bullets categorizados + auto-fill semanal son ahora el flujo unico.
  // El render legacy (textarea libre) queda solo en el codigo como rama
  // muerta — la entrada `if (true)` siempre se toma.
  const [type, setType] = useState(defaultType);
  const [reportDate, setReportDate] = useState(today());
  // progressItems: [{ key: client_id | INTERNAL_KEY, label: nombre, text: 'qué avanzó', minutes: '' }]
  const [progressItems, setProgressItems] = useState([]);
  const [nextDay, setNextDay] = useState('');
  const [hasBlocker, setHasBlocker] = useState(false);
  const [blockerDesc, setBlockerDesc] = useState('');
  const [blockerImprovement, setBlockerImprovement] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pickerRef = useRef(null);

  // Clave del borrador en localStorage. Distinta para creacion vs edicion
  // (al editar prefiere los datos del informe real, no un borrador viejo).
  const draftKey = useMemo(() => {
    if (!currentUser?.id) return null;
    if (editingReport) return null; // no autosave al editar
    return `informe_draft__${currentUser.id}__${defaultType}`;
  }, [currentUser?.id, defaultType, editingReport]);

  // Reset / prefill al abrir
  useEffect(() => {
    if (!open) return;
    // Modo creacion: si hay borrador guardado, lo restauramos antes de empezar
    if (!editingReport && draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const d = JSON.parse(raw);
          setType(d.type || defaultType);
          setReportDate(d.reportDate || (defaultType === 'weekly' ? mondayOf(today()) : today()));
          // Al restaurar:
          // 1) Descartar bullets vacios (sin texto y sin categoria). Los
          //    placeholders heredados de "Cargar mis pendientes" sin completar
          //    no deben sobrevivir entre sesiones.
          // 2) Limpiar task_id que apunte a una tarea inexistente o ya done.
          //    Esto resetea el "cache antiguo" del borrador cuando el usuario
          //    completo tareas en una sesion previa.
          const restoredItems = (Array.isArray(d.progressItems) ? d.progressItems : []).map(p => {
            if (!Array.isArray(p?.bullets)) return p;
            const filtered = p.bullets
              .filter(b => {
                const txt = String(b?.text || '').trim();
                return txt || b?.category;
              })
              .map(b => {
                if (!b?.task_id) return b;
                // Si la tarea ya no existe en el contexto o esta done,
                // limpiamos el task_id stale (conservamos texto/categoria).
                const t = (tasksFromContext || []).find(x => x.id === b.task_id);
                if (!t || t.status === 'done') {
                  const { task_id, ...rest } = b;
                  return rest;
                }
                return b;
              });
            return { ...p, bullets: filtered };
          });
          setProgressItems(restoredItems);
          setNextDay(d.nextDay || '');
          setHasBlocker(!!d.hasBlocker);
          setBlockerDesc(d.blockerDesc || '');
          setBlockerImprovement(d.blockerImprovement || '');
          setShowClientPicker(false);
          setPickerSearch('');
          setError('');
          // El draft viene con datos del usuario, marcamos touched para no pisar.
          userTouchedRef.current = true;
          autoFillSourceMondayRef.current = null;
          return; // listo: el resto del effect no aplica
        }
      } catch (e) { /* ignore */ }
    }
    if (editingReport) {
      // Modo edición: precargar el form con los datos del informe existente
      setType(editingReport.report_type || defaultType);
      setReportDate(editingReport.report_date || today());
      const items = Array.isArray(editingReport.progress_by_client) ? editingReport.progress_by_client : [];
      const prefilled = items.map(p => {
        const isInternal = !p.client_id;
        const c = isInternal ? null : (clients || []).find(x => x.id === p.client_id);
        const base = {
          key: isInternal ? INTERNAL_KEY : p.client_id,
          label: isInternal ? INTERNAL_LABEL : (c?.name || 'Cliente eliminado'),
          text: p.text || '',
          minutes: p.minutes != null ? String(p.minutes) : '',
        };
        if (true) {
          // Si el informe original ya tenia bullets categorizados los usamos.
          // Si no, parseamos el text y dejamos los bullets sin categoria
          // (el usuario los puede clasificar al editar).
          base.bullets = getBullets(p);
        }
        return base;
      });
      setProgressItems(prefilled);
      // En edicion no auto-rellenamos ni marcamos touched.
      userTouchedRef.current = true;
      autoFillSourceMondayRef.current = null;
      setNextDay(editingReport.next_day || '');
      // Bloqueos no se editan acá (tabla aparte). Si existen quedan tal cual.
      setHasBlocker(false);
      setBlockerDesc('');
      setBlockerImprovement('');
    } else {
      // Modo creación: form en blanco
      setType(defaultType);
      setReportDate(defaultType === 'weekly' ? mondayOf(today()) : today());
      setProgressItems([]);
      setNextDay('');
      setHasBlocker(false);
      setBlockerDesc('');
      setBlockerImprovement('');
      // Form vacio: habilitamos el auto-fill semanal.
      userTouchedRef.current = false;
      autoFillSourceMondayRef.current = null;
    }
    setShowClientPicker(false);
    setPickerSearch('');
    setError('');
  }, [open, defaultType, editingReport, clients]);

  // Cuando cambia el tipo, ajustar la fecha + limpiar items del tipo anterior.
  // Sin este reset, los bullets agregados del semanal (auto-fill) quedaban
  // pegados al volver al diario; el ref de auto-fill tambien queda sucio,
  // asi que lo reseteamos para que la proxima vez se vuelva a disparar.
  const prevTypeRef = useRef(type);
  useEffect(() => {
    if (prevTypeRef.current === type) return;
    prevTypeRef.current = type;
    if (isEditing) return; // en edicion no queremos vaciar nada
    if (type === 'weekly') setReportDate(prev => mondayOf(prev));
    else setReportDate(today());
    setProgressItems([]);
    setNextDay('');
    autoFillSourceMondayRef.current = null;
    userTouchedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Autosave del borrador a localStorage en cada cambio (solo creacion).
  // Se borra explicitamente cuando el guardado en DB sale bien.
  useEffect(() => {
    if (!open || !draftKey || editingReport) return;
    const hasContent =
      progressItems.length > 0 || nextDay.trim() || blockerDesc.trim() || blockerImprovement.trim();
    if (!hasContent) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        type, reportDate, progressItems, nextDay, hasBlocker, blockerDesc, blockerImprovement,
        savedAt: new Date().toISOString(),
      }));
    } catch (e) { /* quota / private mode — ignorar */ }
  }, [open, draftKey, editingReport, type, reportDate, progressItems, nextDay, hasBlocker, blockerDesc, blockerImprovement]);

  // Cerrar picker al click afuera
  useEffect(() => {
    if (!showClientPicker) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowClientPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showClientPicker]);

  const activeClients = useMemo(
    () => (clients || []).filter(c => c.status === 'active').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [clients]
  );

  // Cliente que representa a la empresa misma ("Empresa (Korex)"). Las tareas
  // internas de Korex se cargan bajo este cliente, no con client_id null, asi
  // que el item "Korex – Interno" linkea contra las tareas de este cliente.
  const companyClientId = useMemo(() => {
    const c = (clients || []).find(x => (x.name || '').toLowerCase().includes('korex'));
    return c?.id || null;
  }, [clients]);

  // ── Soporte de semanal asistido (solo flag ON) ────────────────────────────
  const meId = currentUser?.id;
  const weekMonday = (type === 'weekly' && reportDate) ? mondayOf(reportDate) : null;
  const weekDates = useMemo(() => weekMonday ? weekDatesOf(weekMonday) : [], [weekMonday]);

  // Mapa fecha → informe diario del usuario para la semana elegida.
  const dailiesByDate = useMemo(() => {
    if (!weekMonday || !meId) return {};
    const map = {};
    (teamReports || []).forEach(r => {
      if (r.user_id === meId && r.report_type === 'daily' && weekDates.includes(r.report_date)) {
        map[r.report_date] = r;
      }
    });
    return map;
  }, [teamReports, meId, weekMonday, weekDates]);

  // Faltantes Lun-Vie (los 5 primeros de weekDates).
  const missingWeekdays = useMemo(
    () => (weekDates.slice(0, 5) || []).filter(d => !dailiesByDate[d]),
    [weekDates, dailiesByDate],
  );
  const isWeekComplete = weekMonday && missingWeekdays.length === 0;

  // Clientes indexados por id para resolver labels en la agregacion.
  const clientsById = useMemo(() => {
    const map = {};
    (clients || []).forEach(c => { map[c.id] = c; });
    return map;
  }, [clients]);

  // Etiqueta corta para los chips del banner ("Lun 25 may").
  const fmtDayChip = (iso) => {
    try {
      const dt = new Date(iso + 'T12:00:00');
      const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      return `${dias[dt.getDay()]} ${dt.getDate()} ${meses[dt.getMonth()]}`;
    } catch { return iso; }
  };

  // Refs para no pisar la edicion del usuario al auto-rellenar el semanal.
  const autoFillSourceMondayRef = useRef(null);
  const userTouchedRef = useRef(false);

  const selectedKeys = useMemo(() => new Set(progressItems.map(i => i.key)), [progressItems]);

  const toggleClient = (key, label) => {
    userTouchedRef.current = true;
    setProgressItems(prev => {
      const exists = prev.find(i => i.key === key);
      if (exists) return prev.filter(i => i.key !== key);
      const base = { key, label, text: '', minutes: '' };
      if (true) base.bullets = [];
      return [...prev, base];
    });
  };

  const removeItem = (key) => {
    userTouchedRef.current = true;
    setProgressItems(prev => prev.filter(i => i.key !== key));
  };

  const updateItemText = (key, text) => {
    userTouchedRef.current = true;
    setProgressItems(prev => prev.map(i => i.key === key ? { ...i, text } : i));
  };

  // Actualizar bullets de un item (solo flag ON). Mantenemos `text`
  // serializado por compat con renderers viejos.
  const updateItemBullets = (key, bullets) => {
    userTouchedRef.current = true;
    setProgressItems(prev => prev.map(i => i.key === key
      ? { ...i, bullets, text: serializeBullets(bullets) }
      : i));
  };

  // Solo permitir dígitos. Vacío también está OK durante la edición.
  const updateItemMinutes = (key, raw) => {
    userTouchedRef.current = true;
    const onlyDigits = (raw || '').replace(/[^0-9]/g, '');
    setProgressItems(prev => prev.map(i => i.key === key ? { ...i, minutes: onlyDigits } : i));
  };

  // Agregar agrupando por cliente + ordenando bullets por categoria
  // (entregable → avance → sin categoria). Solo se usa en modo semanal
  // cuando los 5 diarios estan cargados y el flag esta ON.
  const aggregateDailiesToWeekly = () => {
    const dailies = weekDates.map(d => dailiesByDate[d]).filter(Boolean);
    const byClient = new Map();
    dailies
      .sort((a, b) => a.report_date.localeCompare(b.report_date))
      .forEach(d => {
        const dayLabel = fmtDayChip(d.report_date);
        (d.progress_by_client || []).forEach(p => {
          const key = p.client_id || INTERNAL_KEY;
          const label = p.client_id
            ? (clientsById[p.client_id]?.name || 'Cliente eliminado')
            : INTERNAL_LABEL;
          // Stampeamos el día en cada bullet (_day/_dayLabel) para poder
          // agrupar el editor semanal por día. Estos campos son internos: el
          // guardado los descarta (solo persiste id/text/category/task_id).
          const bullets = getBullets(p).map(b => ({ ...b, _day: d.report_date, _dayLabel: dayLabel }));
          const prev = byClient.get(key) || { label, bullets: [], minutes: 0 };
          prev.bullets.push(...bullets);
          prev.minutes += parseInt(p.minutes, 10) || 0;
          byClient.set(key, prev);
        });
      });

    // Mantenemos el orden cronológico por día (lunes → viernes) en vez de
    // reordenar por categoría, para que el editor quede segmentado por día.
    return Array.from(byClient.entries()).map(([key, v]) => ({
      key,
      label: v.label,
      bullets: v.bullets,
      text: serializeBullets(v.bullets),
      minutes: String(v.minutes),
    }));
  };

  // Auto-rellenar el form del semanal al elegir una semana con los 5 diarios
  // completos. Solo se dispara una vez por semana (autoFillSourceMondayRef)
  // y nunca pisa lo que el usuario haya tocado a mano.
  useEffect(() => {
    if (!open) return;
    if (!true) return;
    if (isEditing) return;
    if (type !== 'weekly') return;
    if (!isWeekComplete) return;
    if (autoFillSourceMondayRef.current === weekMonday) return; // ya rellenado para esta semana
    if (userTouchedRef.current && autoFillSourceMondayRef.current != null) return;

    const next = aggregateDailiesToWeekly();
    if (next.length === 0) return;
    setProgressItems(next);
    autoFillSourceMondayRef.current = weekMonday;
    userTouchedRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, true, isEditing, type, isWeekComplete, weekMonday]);

  // Si el usuario cambia de semana, permitimos un nuevo auto-fill.
  useEffect(() => {
    if (autoFillSourceMondayRef.current && autoFillSourceMondayRef.current !== weekMonday) {
      userTouchedRef.current = false;
    }
  }, [weekMonday]);


  const totalMinutes = progressItems.reduce((acc, i) => acc + (parseInt(i.minutes, 10) || 0), 0);
  const fmtMinutes = (m) => {
    if (!m) return '0 min';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r === 0 ? `${h}h` : `${h}h ${r}m`;
  };

  const filteredPickerClients = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return activeClients;
    return activeClients.filter(c => (c.name || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q));
  }, [activeClients, pickerSearch]);

  const isValid = () => {
    if (!currentUser?.id) return false;
    if (progressItems.length === 0) return false;
    if (true) {
      // Modo bullets: cada item debe tener al menos un bullet con texto,
      // y los bullets con texto deben tener categoria (al crear un informe).
      const someEmpty = progressItems.some(i => !Array.isArray(i.bullets) || !i.bullets.some(b => (b.text || '').trim()));
      if (someEmpty) return false;
      if (!isEditing) {
        const allCategorized = progressItems.every(i => (i.bullets || []).filter(b => (b.text || '').trim()).every(b => b.category === 'entregable' || b.category === 'avance'));
        if (!allCategorized) return false;
      }
    } else {
      // Modo legacy: textarea libre.
      if (progressItems.some(i => !i.text.trim())) return false;
    }
    if (progressItems.some(i => !i.minutes || parseInt(i.minutes, 10) <= 0)) return false;
    if (type === 'daily' && !nextDay.trim()) return false;
    if (hasBlocker && (!blockerDesc.trim() || !blockerImprovement.trim())) return false;
    // Bloqueo de semanal sin diarios completos (solo modo flag + creacion).
    if (true && !isEditing && type === 'weekly' && missingWeekdays.length > 0) return false;
    return true;
  };

  // Si la validacion falla, devolvemos una lista legible de QUE falta —
  // antes el boton quedaba mudo y el usuario pensaba que estaba "colgado".
  const getValidationIssues = () => {
    const issues = [];
    if (!currentUser?.id) { issues.push('No hay usuario logueado'); return issues; }
    if (progressItems.length === 0) { issues.push('Agregá al menos un cliente o "Korex – Interno" para reportar avance.'); return issues; }
    if (true) {
      const sinBullets = progressItems.filter(i => !Array.isArray(i.bullets) || !i.bullets.some(b => (b.text || '').trim())).map(i => i.label);
      if (sinBullets.length) issues.push(`Falta cargar bullets en: ${sinBullets.join(', ')}.`);
      if (!isEditing) {
        const sinCategoria = progressItems.filter(i => (i.bullets || []).some(b => (b.text || '').trim() && b.category !== 'entregable' && b.category !== 'avance')).map(i => i.label);
        if (sinCategoria.length) issues.push(`Marcá Entregable o Avance en cada bullet de: ${sinCategoria.join(', ')}.`);
      }
    } else {
      const sinTexto = progressItems.filter(i => !i.text.trim()).map(i => i.label);
      if (sinTexto.length) issues.push(`Falta describir el avance en: ${sinTexto.join(', ')}.`);
    }
    const sinMinutos = progressItems.filter(i => !i.minutes || parseInt(i.minutes, 10) <= 0).map(i => i.label);
    if (sinMinutos.length) issues.push(`Falta poner los minutos invertidos en: ${sinMinutos.join(', ')}.`);
    if (type === 'daily' && !nextDay.trim()) issues.push('Falta completar "Qué vas a hacer mañana".');
    if (hasBlocker) {
      if (!blockerDesc.trim()) issues.push('Falta describir el bloqueo.');
      if (!blockerImprovement.trim()) issues.push('Falta la propuesta de mejora del bloqueo.');
    }
    if (true && !isEditing && type === 'weekly' && missingWeekdays.length > 0) {
      issues.push('Faltan informes diarios de la semana: ' + missingWeekdays.map(fmtDayChip).join(', ') + '. Cargalos primero.');
    }
    return issues;
  };

  // Wrapper de timeout: si la peticion al backend tarda mas de N segundos,
  // tiramos un error visible en vez de dejar el boton clavado en "Guardando...".
  // Antes este era el bug que reportaban algunos usuarios.
  const withTimeout = (promise, ms = 20000) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('La petición tardó demasiado. Revisá tu conexión y volvé a intentar.')),
        ms,
      )),
    ]);

  const handleSubmit = async () => {
    if (!isValid()) {
      // Mostrar al usuario QUE le esta faltando — el bug era que el boton
      // quedaba disabled sin explicar nada y parecia "colgado guardando".
      const issues = getValidationIssues();
      setError('No se puede guardar todavía:\n• ' + issues.join('\n• '));
      return;
    }
    setSaving(true);
    setError('');
    let savedOk = false;
    try {
      const progressByClient = progressItems.map(i => {
        const base = {
          client_id: i.key === INTERNAL_KEY ? null : i.key,
          minutes: parseInt(i.minutes, 10) || 0,
        };
        if (true && Array.isArray(i.bullets)) {
          // Filtrar bullets vacios y guardar bullets + text derivado por compat.
          // Preservamos id y task_id si vienen (necesarios para el historial
          // automatico de tareas y para no duplicar al re-guardar).
          const cleaned = i.bullets
            .map(b => ({
              ...(b?.id ? { id: b.id } : {}),
              text: String(b?.text || '').trim(),
              category: b?.category || null,
              ...(b?.task_id ? { task_id: b.task_id } : {}),
              ...(b?.complete_task ? { complete_task: true } : {}),
            }))
            .filter(b => b.text);
          base.bullets = cleaned;
          base.text = serializeBullets(cleaned);
        } else {
          base.text = (i.text || '').trim();
        }
        return base;
      });
      const clientIds = progressByClient.filter(p => p.client_id).map(p => p.client_id);
      const workedInternal = progressByClient.some(p => p.client_id === null);

      if (isEditing) {
        // PATCH de los campos editables. Si el usuario cambio la fecha (cargo
        // por error en otro dia), tambien la actualizamos. La constraint
        // (user_id, report_type, report_date) tira unique-violation si ya
        // hay otro informe en esa fecha — el catch lo muestra al usuario.
        const patch = {
          client_ids: clientIds,
          worked_internal: workedInternal,
          progress_by_client: progressByClient,
          next_day: type === 'daily' ? nextDay.trim() : '',
        };
        const newDate = type === 'weekly' ? mondayOf(reportDate) : reportDate;
        if (newDate && newDate !== editingReport.report_date) {
          patch.report_date = newDate;
        }
        await withTimeout(updateTeamReport(editingReport.id, patch));
        savedOk = true;
        return;
      }

      const payload = {
        user_id: currentUser.id,
        report_type: type,
        report_date: reportDate,
        client_ids: clientIds,
        worked_internal: workedInternal,
        progress_today: '', // legacy — campo nuevo es progress_by_client
        next_day: type === 'daily' ? nextDay.trim() : '',
        progress_by_client: progressByClient,
        weekly_data: {},
      };
      if (hasBlocker) {
        payload.blocker = {
          description: blockerDesc.trim(),
          // Sin cliente — se quitó del form
          client_id: null,
          needs: blockerImprovement.trim(), // se reusa la columna `needs` con el nuevo significado "Propuesta de mejora"
        };
      }
      await withTimeout(addTeamReport(payload));
      savedOk = true;
      // Guardado exitoso: limpiar el borrador para que la proxima apertura sea limpia.
      if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
    } catch (e) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('23505') || msg.includes('unique')) {
        setError('Ya tenés un informe ' + (type === 'daily' ? 'diario' : 'semanal') + ' para esa fecha. Editalo en lugar de duplicarlo.');
      } else if (msg.includes('tardó demasiado') || msg.includes('timeout')) {
        setError('La petición tardó demasiado. Tu informe quedó guardado como borrador — revisá la conexión y volvé a intentar.');
      } else {
        setError('Error al guardar: ' + (e?.message || e));
      }
    } finally {
      // SIEMPRE liberamos el boton. Si salio bien, ademas cerramos el modal.
      setSaving(false);
      if (savedOk) onClose();
    }
  };

  const baseLabel = type === 'daily'
    ? `informe diario · ${fmtDateLabel(reportDate)}`
    : `informe semanal · semana del ${fmtDateLabel(reportDate)}`;
  const headerLabel = isEditing
    ? 'Editar ' + baseLabel
    : baseLabel.charAt(0).toUpperCase() + baseLabel.slice(1);

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={headerLabel}
      maxWidth={type === 'weekly' ? 1000 : 820}
      dismissOnOverlay={false}
      dismissOnEscape={false}
      footer={
        <>
          {!isEditing && draftKey && progressItems.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!confirm('Descartar el borrador y empezar de cero?')) return;
                try { localStorage.removeItem(draftKey); } catch {}
                setProgressItems([]);
                setNextDay('');
                setHasBlocker(false);
                setBlockerDesc('');
                setBlockerImprovement('');
                userTouchedRef.current = false;
              }}
              disabled={saving}
              className="py-2 px-3 bg-transparent border border-amber-200 text-amber-700 text-[12px] rounded-lg cursor-pointer font-sans hover:bg-amber-50 disabled:opacity-40 mr-auto"
              title="Empezar de cero (no guarda en DB, solo el borrador local)"
            >Descartar borrador</button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="py-2 px-4 bg-transparent border border-gray-200 text-gray-600 text-[13px] rounded-lg cursor-pointer font-sans hover:bg-gray-50 disabled:opacity-40"
          >Cancelar</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            title={!isValid() && !saving ? 'Hay datos faltantes — clic para ver qué' : undefined}
            className="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40"
          >{saving ? 'Guardando...' : (isEditing ? 'Guardar cambios ✓' : 'Guardar ✓')}</button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Tipo (no editable cuando se edita un informe existente) */}
        {!isEditing && (
          <div className="flex gap-1.5">
            {[
              { key: 'daily', label: 'Diario' },
              { key: 'weekly', label: 'Semanal' },
            ].map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border cursor-pointer font-sans transition-colors ${
                  type === t.key ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >{t.label}</button>
            ))}
          </div>
        )}

        {/* Fecha — editable tambien en modo edicion. Si la nueva fecha colisiona
            con otro informe del mismo tipo, el backend devuelve unique-violation
            y se muestra el error al usuario. */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
            {type === 'daily' ? 'Fecha del informe' : 'Semana del informe (siempre arranca un lunes)'}
          </label>
            {type === 'weekly' ? (
              (() => {
                // Lista de Lunes seleccionables: esta semana + 12 semanas atras.
                // No mostramos semanas futuras: un informe semanal se carga sobre
                // una semana que ya pasaste o esta en curso.
                const todayMon = mondayOf(today());
                const opts = [];
                for (let i = 0; i <= 12; i++) {
                  const [y, m, d] = todayMon.split('-').map(Number);
                  const dt = new Date(y, m - 1, d);
                  dt.setDate(dt.getDate() - i * 7);
                  const pad = (n) => String(n).padStart(2, '0');
                  const iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
                  // Calcular fin de semana (domingo)
                  const dt2 = new Date(dt); dt2.setDate(dt2.getDate() + 6);
                  const monthName = dt.toLocaleDateString('es-AR', { month: 'short' });
                  const sameMonth = dt.getMonth() === dt2.getMonth();
                  const label = sameMonth
                    ? `Semana del ${dt.getDate()} al ${dt2.getDate()} de ${monthName} ${dt.getFullYear()}`
                    : `Semana del ${dt.getDate()} ${dt.toLocaleDateString('es-AR', { month: 'short' })} al ${dt2.getDate()} ${dt2.toLocaleDateString('es-AR', { month: 'short' })} ${dt2.getFullYear()}`;
                  opts.push({ value: iso, label, isCurrent: iso === todayMon });
                }
                // Si reportDate no coincide con ningun lunes (ej: arrastrado de un draft),
                // forzamos al lunes mas cercano para que el select tenga match.
                const currentIso = mondayOf(reportDate);
                if (!opts.some(o => o.value === currentIso)) {
                  opts.unshift({ value: currentIso, label: 'Semana del ' + fmtDateLabel(currentIso), isCurrent: false });
                }
                return (
                  <select
                    value={currentIso}
                    onChange={e => setReportDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 bg-white cursor-pointer"
                  >
                    {opts.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}{o.isCurrent ? ' · esta semana' : ''}
                      </option>
                    ))}
                  </select>
                );
              })()
            ) : (
              <input
                type="date"
                value={reportDate}
                onChange={e => setReportDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400"
              />
          )}
        </div>

        {/* Banner del semanal asistido — solo flag ON + weekly + creacion */}
        {true && type === 'weekly' && !isEditing && weekMonday && (
          isWeekComplete ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-800 flex items-start gap-2">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
              <div>
                <div className="font-semibold">Tenés los 5 diarios cargados de esta semana.</div>
                <div className="text-green-700">El informe semanal se generó automáticamente desde tus diarios — revisalo y editá antes de guardar.</div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600" />
                <div className="flex-1">
                  <div className="font-semibold">Te faltan informes diarios de esta semana.</div>
                  <div className="text-red-700 mt-0.5">Cargá esos primero para poder generar el semanal.</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {missingWeekdays.map(d => (
                      <span key={d} className="bg-white border border-red-200 text-red-700 text-[10.5px] font-semibold rounded-full px-2 py-0.5">
                        {fmtDayChip(d)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* Selector de clientes */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
            {type === 'daily' ? '¿En qué clientes trabajaste hoy?' : '¿En qué clientes trabajaste esta semana?'}
          </label>
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowClientPicker(v => !v)}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans bg-white text-left flex items-center justify-between hover:border-blue-300 cursor-pointer"
            >
              <span className={progressItems.length === 0 ? 'text-gray-400' : 'text-gray-700'}>
                {progressItems.length === 0
                  ? 'Seleccionar clientes…'
                  : `${progressItems.length} seleccionado${progressItems.length !== 1 ? 's' : ''}`}
              </span>
              <ChevronDown size={14} className={`text-gray-400 transition-transform ${showClientPicker ? 'rotate-180' : ''}`} />
            </button>
            {showClientPicker && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[260px] overflow-hidden flex flex-col">
                {/* Search */}
                <div className="relative border-b border-gray-100 px-2 py-1.5">
                  <Search size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Buscar cliente…"
                    autoFocus
                    className="w-full text-[12px] border border-transparent rounded-md py-1 pl-6 pr-2 outline-none focus:border-blue-300 bg-gray-50 font-sans"
                  />
                </div>
                <div className="overflow-y-auto">
                  {/* Korex – Interno (siempre primero) */}
                  <button
                    type="button"
                    onClick={() => toggleClient(INTERNAL_KEY, INTERNAL_LABEL)}
                    className={`w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 cursor-pointer border-none bg-transparent hover:bg-purple-50 ${
                      selectedKeys.has(INTERNAL_KEY) ? 'bg-purple-50/60' : ''
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 border rounded-sm shrink-0 flex items-center justify-center ${
                      selectedKeys.has(INTERNAL_KEY) ? 'bg-purple-500 border-purple-500' : 'border-gray-300 bg-white'
                    }`}>
                      {selectedKeys.has(INTERNAL_KEY) && <span className="text-white text-[10px] leading-none">✓</span>}
                    </span>
                    <span className="text-purple-700 font-semibold">{INTERNAL_LABEL}</span>
                  </button>
                  {/* Clientes activos */}
                  {filteredPickerClients.map(c => {
                    const sel = selectedKeys.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleClient(c.id, c.name)}
                        className={`w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 cursor-pointer border-none bg-transparent hover:bg-blue-50 ${
                          sel ? 'bg-blue-50/60' : ''
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 border rounded-sm shrink-0 flex items-center justify-center ${
                          sel ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'
                        }`}>
                          {sel && <span className="text-white text-[10px] leading-none">✓</span>}
                        </span>
                        <span className="text-gray-700">{c.name}</span>
                        {c.company && <span className="text-gray-400 text-[11px] truncate">{c.company}</span>}
                      </button>
                    );
                  })}
                  {filteredPickerClients.length === 0 && pickerSearch && (
                    <div className="text-center text-[11px] text-gray-400 py-4">Sin resultados</div>
                  )}
                </div>
                <div className="border-t border-gray-100 px-3 py-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowClientPicker(false)}
                    className="text-[11px] text-blue-600 hover:underline bg-transparent border-none cursor-pointer p-0"
                  >Listo</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cards de avance por cliente */}
        {progressItems.length > 0 && (
          <div className="space-y-2.5">
            {progressItems.map(item => {
              const isInternal = item.key === INTERNAL_KEY;
              return (
                <div
                  key={item.key}
                  className={`border rounded-lg p-3 ${isInternal ? 'border-purple-200 bg-purple-50/30' : 'border-blue-200 bg-blue-50/30'}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide ${
                        isInternal ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>{item.label}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5"
                      title="Quitar"
                    ><X size={14} /></button>
                  </div>
                  {type === 'weekly' ? (
                    <>
                      <label className="block text-[10.5px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                        Para el informe semanal
                      </label>
                      <WeeklyBulletsByDay
                        bullets={Array.isArray(item.bullets) ? item.bullets : []}
                        onChange={(next) => updateItemBullets(item.key, next)}
                        clientId={item.key !== INTERNAL_KEY ? item.key : null}
                        isInternal={item.key === INTERNAL_KEY}
                        internalTaskClientId={companyClientId}
                        enableTaskLink={false}
                      />
                    </>
                  ) : (
                    <>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        ¿Qué avanzaste con {item.label}?
                      </label>
                      <BulletRows
                        bullets={Array.isArray(item.bullets) ? item.bullets : []}
                        onChange={(next) => updateItemBullets(item.key, next)}
                        clientId={item.key !== INTERNAL_KEY ? item.key : null}
                        isInternal={item.key === INTERNAL_KEY}
                        internalTaskClientId={companyClientId}
                        enableTaskLink={type === 'daily'}
                      />
                    </>
                  )}
                  {/* Minutos invertidos en este avance — borde rojo si falta */}
                  {(() => {
                    const minutesEmpty = !item.minutes || parseInt(item.minutes, 10) <= 0;
                    return (
                      <div className="mt-2 flex items-center gap-2">
                        <label className={`text-[11px] font-semibold ${minutesEmpty ? 'text-red-500' : 'text-gray-600'}`}>
                          Tiempo invertido <span className="text-red-500">*</span>:
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.minutes}
                          onChange={e => updateItemMinutes(item.key, e.target.value)}
                          placeholder="ej: 45"
                          className={`w-20 border rounded-md py-1 px-2 text-[13px] font-sans outline-none focus:border-blue-400 bg-white text-right ${
                            minutesEmpty ? 'border-red-300 bg-red-50/40' : 'border-gray-200'
                          }`}
                        />
                        <span className="text-[11px] text-gray-500">
                          min{item.minutes && parseInt(item.minutes, 10) >= 60 ? ` · ${fmtMinutes(parseInt(item.minutes, 10))}` : ''}
                        </span>
                        {minutesEmpty && (
                          <span className="text-[10px] text-red-500 font-medium">Obligatorio</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            {/* Total */}
            {totalMinutes > 0 && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <span className="text-[11px] text-gray-500">Total del informe:</span>
                <span className="text-[12px] font-semibold text-gray-700">{fmtMinutes(totalMinutes)}</span>
              </div>
            )}
          </div>
        )}

        {/* "Qué vas a avanzar mañana" — solo daily */}
        {type === 'daily' && (
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">¿Qué vas a avanzar mañana?</label>
            <textarea
              value={nextDay}
              onChange={e => setNextDay(e.target.value)}
              placeholder="Termino de subir los creatives a Meta y armo el primer borrador de la VSL de Corina."
              rows={3}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 resize-y"
            />
          </div>
        )}

        {/* Bloqueo (switch) — solo cuando se crea un informe nuevo. Los bloqueos
            se editan/resuelven desde el tab "Bloqueos" porque viven en otra tabla. */}
        {!isEditing && (
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">¿Tuviste algún bloqueo?</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setHasBlocker(false)}
                className={`text-[12px] font-semibold px-4 py-1.5 rounded-full border cursor-pointer font-sans transition-colors ${
                  !hasBlocker ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}
              >NO</button>
              <button
                type="button"
                onClick={() => setHasBlocker(true)}
                className={`text-[12px] font-semibold px-4 py-1.5 rounded-full border cursor-pointer font-sans transition-colors ${
                  hasBlocker ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                }`}
              >SÍ</button>
            </div>
          </div>
        )}

        {/* Mini-sección de bloqueo */}
        {hasBlocker && (
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-2">
            <div>
              <label className="block text-[11px] font-semibold text-red-700 mb-1">¿Qué te bloqueó?</label>
              <input
                type="text"
                value={blockerDesc}
                onChange={e => setBlockerDesc(e.target.value)}
                placeholder="Faltan los assets de imagen del cliente"
                className="w-full border border-red-200 rounded-md py-1.5 px-2.5 text-[13px] font-sans outline-none focus:border-red-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-red-700 mb-1">Propuesta de mejora</label>
              <input
                type="text"
                value={blockerImprovement}
                onChange={e => setBlockerImprovement(e.target.value)}
                placeholder="Cómo evitar que vuelva a pasar"
                className="w-full border border-red-200 rounded-md py-1.5 px-2.5 text-[13px] font-sans outline-none focus:border-red-400 bg-white"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-md py-2 px-3 whitespace-pre-line">{error}</div>
        )}
      </div>
    </Modal>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, ChevronDown, Search } from 'lucide-react';
import Modal from '../Modal';
import { useApp } from '../../context/AppContext';
import { today } from '../../utils/helpers';

// Lunes (ISO) de la fecha pasada → string YYYY-MM-DD
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fmtDateLabel(dateStr) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  } catch { return dateStr; }
}

const INTERNAL_KEY = '__internal__';
const INTERNAL_LABEL = 'Korex – Interno';

export default function CrearInformeModal({ open, onClose, defaultType = 'daily' }) {
  const { clients, currentUser, addTeamReport } = useApp();
  const [type, setType] = useState(defaultType);
  const [reportDate, setReportDate] = useState(today());
  // progressItems: [{ key: client_id | INTERNAL_KEY, label: nombre, text: 'qué avanzó' }]
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

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setType(defaultType);
      setReportDate(defaultType === 'weekly' ? mondayOf(today()) : today());
      setProgressItems([]);
      setNextDay('');
      setHasBlocker(false);
      setBlockerDesc('');
      setBlockerImprovement('');
      setShowClientPicker(false);
      setPickerSearch('');
      setError('');
    }
  }, [open, defaultType]);

  // Cuando cambia el tipo, ajustar la fecha
  useEffect(() => {
    if (type === 'weekly') setReportDate(prev => mondayOf(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

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

  const selectedKeys = useMemo(() => new Set(progressItems.map(i => i.key)), [progressItems]);

  const toggleClient = (key, label) => {
    setProgressItems(prev => {
      const exists = prev.find(i => i.key === key);
      if (exists) return prev.filter(i => i.key !== key);
      return [...prev, { key, label, text: '' }];
    });
  };

  const removeItem = (key) => {
    setProgressItems(prev => prev.filter(i => i.key !== key));
  };

  const updateItemText = (key, text) => {
    setProgressItems(prev => prev.map(i => i.key === key ? { ...i, text } : i));
  };

  const filteredPickerClients = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return activeClients;
    return activeClients.filter(c => (c.name || '').toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q));
  }, [activeClients, pickerSearch]);

  const isValid = () => {
    if (!currentUser?.id) return false;
    if (progressItems.length === 0) return false;
    // Cada item debe tener texto
    if (progressItems.some(i => !i.text.trim())) return false;
    if (type === 'daily' && !nextDay.trim()) return false;
    if (hasBlocker && (!blockerDesc.trim() || !blockerImprovement.trim())) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!isValid()) return;
    setSaving(true);
    setError('');
    try {
      const progressByClient = progressItems.map(i => ({
        client_id: i.key === INTERNAL_KEY ? null : i.key,
        text: i.text.trim(),
      }));
      const clientIds = progressByClient.filter(p => p.client_id).map(p => p.client_id);
      const workedInternal = progressByClient.some(p => p.client_id === null);

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
      await addTeamReport(payload);
      onClose();
    } catch (e) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('23505') || msg.includes('unique')) {
        setError('Ya tenés un informe ' + (type === 'daily' ? 'diario' : 'semanal') + ' para esa fecha. Editalo en lugar de duplicarlo.');
      } else {
        setError('Error al guardar: ' + (e?.message || e));
      }
    }
    setSaving(false);
  };

  const headerLabel = type === 'daily'
    ? `Informe diario · ${fmtDateLabel(reportDate)}`
    : `Informe semanal · semana del ${fmtDateLabel(reportDate)}`;

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={headerLabel}
      maxWidth={580}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="py-2 px-4 bg-transparent border border-gray-200 text-gray-600 text-[13px] rounded-lg cursor-pointer font-sans hover:bg-gray-50 disabled:opacity-40"
          >Cancelar</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid() || saving}
            className="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40"
          >{saving ? 'Guardando...' : 'Guardar ✓'}</button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Tipo */}
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

        {/* Fecha */}
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
            {type === 'daily' ? 'Fecha del informe' : 'Lunes de la semana'}
          </label>
          <input
            type="date"
            value={reportDate}
            onChange={e => setReportDate(type === 'weekly' ? mondayOf(e.target.value) : e.target.value)}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400"
          />
        </div>

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
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    ¿Qué avanzaste con {item.label}?
                  </label>
                  <textarea
                    value={item.text}
                    onChange={e => updateItemText(item.key, e.target.value)}
                    placeholder={isInternal
                      ? 'Ej: Avancé el rediseño del panel de operaciones'
                      : 'Ej: Entregué los guiones y dejé la landing lista para revisión'}
                    rows={2}
                    className="w-full border border-gray-200 rounded-md py-1.5 px-2 text-[13px] font-sans outline-none focus:border-blue-400 resize-y bg-white"
                  />
                </div>
              );
            })}
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

        {/* Bloqueo (switch) */}
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
          <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-md py-2 px-3">{error}</div>
        )}
      </div>
    </Modal>
  );
}

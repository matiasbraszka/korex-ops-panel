import { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { useApp } from '../../context/AppContext';
import { today } from '../../utils/helpers';

// Lunes (ISO) de la fecha pasada → string YYYY-MM-DD
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=dom, 1=lun, ..., 6=sab
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fmtDateLabel(dateStr) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  } catch { return dateStr; }
}

const KOREX_INTERNO = '__internal__';

export default function CrearInformeModal({ open, onClose, defaultType = 'daily' }) {
  const { clients, currentUser, addTeamReport } = useApp();
  const [type, setType] = useState(defaultType);
  const [reportDate, setReportDate] = useState(today());
  const [clientIds, setClientIds] = useState([]);
  const [workedInternal, setWorkedInternal] = useState(false);
  const [progressToday, setProgressToday] = useState('');
  const [nextDay, setNextDay] = useState('');
  const [hasBlocker, setHasBlocker] = useState(false);
  const [blockerDesc, setBlockerDesc] = useState('');
  const [blockerClient, setBlockerClient] = useState('');
  const [blockerNeeds, setBlockerNeeds] = useState('');
  // Semanal
  const [weeklyAchievements, setWeeklyAchievements] = useState('');
  const [weeklyRetro, setWeeklyRetro] = useState('');
  const [weeklyNextWeek, setWeeklyNextWeek] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Resetear cuando se abre
  useEffect(() => {
    if (open) {
      setType(defaultType);
      setReportDate(defaultType === 'weekly' ? mondayOf(today()) : today());
      setClientIds([]);
      setWorkedInternal(false);
      setProgressToday('');
      setNextDay('');
      setHasBlocker(false);
      setBlockerDesc('');
      setBlockerClient('');
      setBlockerNeeds('');
      setWeeklyAchievements('');
      setWeeklyRetro('');
      setWeeklyNextWeek('');
      setError('');
    }
  }, [open, defaultType]);

  // Cuando cambia el tipo, ajustar la fecha
  useEffect(() => {
    if (type === 'weekly') {
      setReportDate(mondayOf(reportDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const activeClients = useMemo(
    () => (clients || []).filter(c => c.status === 'active').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [clients]
  );

  const toggleClient = (id) => {
    setClientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const isValid = () => {
    if (!currentUser?.id) return false;
    if (type === 'daily') {
      if (!progressToday.trim() || !nextDay.trim()) return false;
      if (clientIds.length === 0 && !workedInternal) return false;
      if (hasBlocker && (!blockerDesc.trim() || !blockerNeeds.trim())) return false;
    } else {
      if (!weeklyAchievements.trim() || !weeklyNextWeek.trim()) return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!isValid()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        user_id: currentUser.id,
        report_type: type,
        report_date: reportDate,
        client_ids: clientIds,
        worked_internal: workedInternal,
        progress_today: type === 'daily' ? progressToday : '',
        next_day: type === 'daily' ? nextDay : '',
        weekly_data: type === 'weekly' ? {
          achievements: weeklyAchievements,
          retro: weeklyRetro,
          next_week: weeklyNextWeek,
        } : {},
      };
      if (type === 'daily' && hasBlocker) {
        payload.blocker = {
          description: blockerDesc.trim(),
          client_id: blockerClient && blockerClient !== KOREX_INTERNO ? blockerClient : null,
          needs: blockerNeeds.trim(),
        };
      }
      await addTeamReport(payload);
      onClose();
    } catch (e) {
      // 23505 = unique violation (ya hay informe para ese día/semana)
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
      maxWidth={560}
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
        {/* Tipo (toggle) */}
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

        {type === 'daily' ? (
          <>
            {/* Campo 1: Clientes (multi) */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">¿En qué cliente trabajaste hoy?</label>
              <div className="flex flex-wrap gap-1.5">
                {activeClients.map(c => {
                  const sel = clientIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleClient(c.id)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer font-sans transition-colors ${
                        sel ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}
                    >{c.name}</button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setWorkedInternal(v => !v)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer font-sans transition-colors ${
                    workedInternal ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-purple-600 border-purple-200 hover:border-purple-400'
                  }`}
                >{workedInternal ? '✓ ' : '+ '}Korex – Interno</button>
              </div>
            </div>

            {/* Campo 2: progreso hoy */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">¿Qué avanzaste hoy?</label>
              <textarea
                value={progressToday}
                onChange={e => setProgressToday(e.target.value)}
                placeholder="Entregué los guiones de los ads de Corina y dejé la landing del cliente nuevo lista para revisión."
                rows={3}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 resize-y"
              />
            </div>

            {/* Campo 3: progreso mañana */}
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

            {/* Campo 4: Bloqueo (switch) */}
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

            {/* Mini-sección de bloqueo (condicional) */}
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
                  <label className="block text-[11px] font-semibold text-red-700 mb-1">¿De qué cliente o proyecto?</label>
                  <select
                    value={blockerClient}
                    onChange={e => setBlockerClient(e.target.value)}
                    className="w-full border border-red-200 rounded-md py-1.5 px-2.5 text-[13px] font-sans outline-none focus:border-red-400 bg-white"
                  >
                    <option value="">— Seleccionar —</option>
                    <option value={KOREX_INTERNO}>Korex – Interno</option>
                    {activeClients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-red-700 mb-1">¿Qué necesitás para destrabarte?</label>
                  <input
                    type="text"
                    value={blockerNeeds}
                    onChange={e => setBlockerNeeds(e.target.value)}
                    placeholder="Que el cliente mande las fotos por Drive"
                    className="w-full border border-red-200 rounded-md py-1.5 px-2.5 text-[13px] font-sans outline-none focus:border-red-400 bg-white"
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Semanal */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">¿Qué lograste esta semana?</label>
              <textarea
                value={weeklyAchievements}
                onChange={e => setWeeklyAchievements(e.target.value)}
                placeholder="Logros principales, entregas, hitos cerrados..."
                rows={4}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 resize-y"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">¿Qué no funcionó / aprendiste?</label>
              <textarea
                value={weeklyRetro}
                onChange={e => setWeeklyRetro(e.target.value)}
                placeholder="Cosas que no salieron como esperabas, retroaprendizajes, ajustes para la próxima semana..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 resize-y"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">¿Qué vas a hacer la próxima semana?</label>
              <textarea
                value={weeklyNextWeek}
                onChange={e => setWeeklyNextWeek(e.target.value)}
                placeholder="Foco principal, prioridades, entregas comprometidas..."
                rows={4}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 resize-y"
              />
            </div>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-md py-2 px-3">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

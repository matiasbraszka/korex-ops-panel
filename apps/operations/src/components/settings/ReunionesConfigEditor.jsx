import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { sbFetch } from '@korex/db';
import SaveBar from './SaveBar';

// Config de las reuniones de equipo: a qué canal de Slack va cada tipo de reunión
// y el Slack ID de cada persona (para mandarle el DM con sus accionables).
// - Canales por grupo  -> app_settings('reuniones_config').grupos
// - Slack ID por persona -> team_members.slack_id
// La Edge Function `reunion-reporte` lee ambos al enviar.

const GRUPOS = [
  { id: 'marketing',    label: 'Marketing' },
  { id: 'socios',       label: 'Socios' },
  { id: 'programacion', label: 'Programación' },
  { id: 'abogada',      label: 'Legal / Abogada' },
  { id: 'equipo',       label: 'Equipo (general)' },
];

const DEFAULT_GRUPOS = {
  marketing:    { channel: '', members: [] },
  socios:       { channel: '', members: [] },
  programacion: { channel: '', members: [] },
  abogada:      { channel: '', members: [] },
  equipo:       { channel: '', members: [] },
};

const input = 'w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500';

export default function ReunionesConfigEditor() {
  const { teamMembers, updateTeamMember } = useApp();
  const TEAM = teamMembers || [];

  const [grupos, setGrupos] = useState(DEFAULT_GRUPOS);
  const [slackIds, setSlackIds] = useState({}); // member_id -> slack_id
  const [testMode, setTestMode] = useState(false);
  const [testDmTo, setTestDmTo] = useState('matias');
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Cargar config de canales (key propia en app_settings).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await sbFetch('app_settings?key=eq.reuniones_config&select=value');
        const val = (Array.isArray(rows) && rows[0]?.value) || {};
        if (alive) {
          setGrupos({ ...DEFAULT_GRUPOS, ...(val.grupos || {}) });
          setTestMode(val.test_mode === true);
          setTestDmTo(val.test_dm_to || 'matias');
        }
      } catch { /* usa defaults */ }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  // Sembrar slackIds desde teamMembers cuando no hay edición pendiente.
  useEffect(() => {
    if (!dirty) {
      const map = {};
      for (const m of TEAM) map[m.id] = m.slack_id || '';
      setSlackIds(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMembers]);

  const setChannel = (gid, channel) => {
    setGrupos((g) => ({ ...g, [gid]: { ...(g[gid] || { members: [] }), channel } }));
    setDirty(true);
  };
  const setSlack = (mid, v) => {
    setSlackIds((s) => ({ ...s, [mid]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    // 1) Guardar canales + flags (upsert de la key reuniones_config).
    await sbFetch('app_settings', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({ key: 'reuniones_config', value: { grupos, test_mode: testMode, test_dm_to: testDmTo } }),
    });
    // 2) Guardar solo los slack_id que cambiaron.
    const changed = TEAM.filter((m) => (slackIds[m.id] || '') !== (m.slack_id || ''));
    await Promise.all(changed.map((m) => updateTeamMember(m.id, { slack_id: (slackIds[m.id] || '').trim() || null })));
    setDirty(false);
  };

  const handleCancel = () => {
    const map = {};
    for (const m of TEAM) map[m.id] = m.slack_id || '';
    setSlackIds(map);
    setDirty(false);
    // recargar config
    sbFetch('app_settings?key=eq.reuniones_config&select=value').then((rows) => {
      const val = (Array.isArray(rows) && rows[0]?.value) || {};
      setGrupos({ ...DEFAULT_GRUPOS, ...(val.grupos || {}) });
      setTestMode(val.test_mode === true);
      setTestDmTo(val.test_dm_to || 'matias');
    }).catch(() => {});
  };

  const nameOf = (id) => TEAM.find((m) => m.id === id)?.name || id;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[860px] relative space-y-6">
      <div>
        <h2 className="text-[14px] font-bold text-gray-800">Reuniones de equipo</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Cuando se procesa una reunión de equipo, la IA arma un reporte por persona y lo dejás listo
          para revisar y enviar desde la pantalla de Llamadas. Acá configurás a qué canal va cada tipo
          de reunión y el Slack de cada persona para el DM.
        </p>
      </div>

      {/* Modo prueba */}
      <Section title="Modo prueba">
        <div className={`rounded-lg border p-3 ${testMode ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => { setTestMode(e.target.checked); setDirty(true); }}
              className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer"
            />
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold text-gray-800">Activar modo prueba</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Mientras esté activo, al "Enviar" <b>no</b> se modifican tareas, <b>no</b> se mandan DMs al equipo y <b>no</b> se postea a los canales.
                En su lugar se manda un único mensaje con el preview completo a la persona elegida abajo. Apagalo cuando quieras que salga de verdad.
              </div>
            </div>
          </label>
          {testMode && (
            <div className="flex items-center gap-2 mt-2.5 ml-6">
              <span className="text-[11px] text-gray-600">Mandar el preview a:</span>
              <select
                value={testDmTo}
                onChange={(e) => { setTestDmTo(e.target.value); setDirty(true); }}
                className="py-1.5 px-2.5 text-[12px] border border-gray-200 rounded outline-none focus:border-amber-500 bg-white"
              >
                {TEAM.filter((m) => m.slack_id).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Section>

      {/* Canales por grupo */}
      <Section title="Canal de Slack por tipo de reunión">
        <p className="text-[11px] text-gray-400 -mt-1">
          El ID del canal empieza con <b>C</b> (en Slack: abrí el canal → nombre del canal → al fondo "Copiar ID del canal").
          El bot tiene que estar en el canal.
        </p>
        <div className="space-y-2">
          {GRUPOS.map((g) => (
            <div key={g.id} className="border border-gray-200 rounded-md p-2.5 bg-gray-50">
              <div className="flex gap-2 items-center">
                <div className="w-[150px] shrink-0 text-[12.5px] font-semibold text-gray-700">{g.label}</div>
                <input
                  value={grupos[g.id]?.channel || ''}
                  onChange={(e) => setChannel(g.id, e.target.value)}
                  className={input + ' bg-white font-mono'}
                  placeholder="C0XXXXXXXXX"
                />
              </div>
              {(grupos[g.id]?.members || []).length > 0 && (
                <div className="text-[10px] text-gray-400 mt-1.5 ml-[158px]">
                  Sugeridos: {(grupos[g.id].members).map(nameOf).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Slack ID por persona */}
      <Section title="Slack ID por persona (para el DM)">
        <p className="text-[11px] text-gray-400 -mt-1">
          El Slack User ID empieza con <b>U</b> (Perfil de la persona → Más → "Copiar ID de miembro").
          Si falta, su reporte se manda como mención en el canal + notificación en el panel.
        </p>
        <div className="space-y-2">
          {TEAM.map((m) => (
            <div key={m.id} className="flex gap-2 items-center">
              <div className="w-[180px] shrink-0 text-[12.5px] text-gray-700 truncate">
                {m.name} <span className="text-[10px] text-gray-400">· {m.role}</span>
              </div>
              <input
                value={slackIds[m.id] ?? ''}
                onChange={(e) => setSlack(m.id, e.target.value)}
                className={input + ' font-mono'}
                placeholder="U0XXXXXXX"
              />
            </div>
          ))}
        </div>
      </Section>

      {loaded && <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0 space-y-3">
      <div className="text-[13px] font-bold text-gray-700">{title}</div>
      {children}
    </div>
  );
}

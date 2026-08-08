import { useMemo, useRef, useState, useEffect } from 'react';
import { ListChecks, Plus, Trash2, Check, X, Save, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_CHECKLIST_TEMPLATES, buildChecklistFromTemplate } from '../../utils/helpers';

// Tandas de checklist, manejadas DESDE LA TAREA.
//
// Antes solo se podían cargar acá y había que ir a Configuración para armarlas. En la
// práctica eso significaba que no las armaba nadie: la tanda se te ocurre justo cuando
// estás escribiendo la checklist por tercera vez, no cuando entrás a Configuración.
//
// Así que todo pasa por acá:
//   · cargar una tanda (se agrega al final, nunca pisa)
//   · guardar la checklist que tenés escrita como tanda nueva
//   · pisar una tanda con la checklist actual ("Actualizar")
//   · renombrarla o borrarla
//
// Se guardan en app_settings.checklist_templates, las mismas que edita Configuración:
// es la misma lista vista desde dos lados.

const mkId = () => 'ctpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function ChecklistTandas({ checklist, onCargar }) {
  const { appSettings, updateAppSettings } = useApp();
  const [abierto, setAbierto] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [editId, setEditId] = useState(null);
  const [confirmar, setConfirmar] = useState(null);   // id de la tanda a borrar
  const ref = useRef(null);

  // Una lista vacía es una decisión guardada, no "falta configurar": solo se ofrece
  // la de ejemplo mientras nadie tocó nada.
  const tandas = useMemo(() => {
    const fromDb = appSettings?.checklist_templates;
    return Array.isArray(fromDb) ? fromDb : DEFAULT_CHECKLIST_TEMPLATES;
  }, [appSettings]);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  const guardar = (lista) => updateAppSettings({ checklist_templates: lista });

  // Los textos de la checklist que está escrita en la tarea ahora mismo.
  const textosActuales = (checklist || []).map(i => String(i.text || '').trim()).filter(Boolean);

  const crearDesdeLaTarea = () => {
    const nombre = nombreNuevo.trim();
    if (!nombre || !textosActuales.length) return;
    guardar([...tandas, { id: mkId(), nombre, items: textosActuales }]);
    setNombreNuevo('');
  };
  const actualizar = (t) => {
    if (!textosActuales.length) return;
    guardar(tandas.map(x => (x.id === t.id ? { ...x, items: textosActuales } : x)));
  };
  const renombrar = (t, nombre) => {
    setEditId(null);
    const n = String(nombre || '').trim();
    if (!n || n === t.nombre) return;
    guardar(tandas.map(x => (x.id === t.id ? { ...x, nombre: n } : x)));
  };
  const borrar = (t) => { setConfirmar(null); guardar(tandas.filter(x => x.id !== t.id)); };
  const cargar = (t) => {
    const nuevos = buildChecklistFromTemplate(t);
    if (nuevos.length) onCargar(nuevos);
    setAbierto(false);
  };

  const fila = { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #F6F7F9' };
  const iconBtn = (color) => ({ width: 24, height: 24, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color, cursor: 'pointer' });

  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 8 }}>
      <button onClick={() => setAbierto(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', fontSize: 12, fontWeight: 600, color: '#6B7280', border: '1px dashed #D0D5DD', borderRadius: 9, padding: '10px 11px', background: '#FAFBFC', cursor: 'pointer', fontFamily: 'inherit' }}>
        <ListChecks size={14} />
        Tandas guardadas
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#9CA3AF' }}>{tandas.length}</span>
      </button>

      {abierto && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6, zIndex: 20, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, boxShadow: '0 12px 32px rgba(10,22,40,.16)', padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#AEB4BF', marginBottom: 6 }}>Tandas guardadas</div>

          {tandas.length === 0 && (
            <div style={{ fontSize: 11.5, color: '#9CA3AF', padding: '8px 0 10px' }}>Todavía no hay ninguna. Armá la checklist acá abajo y guardala como tanda.</div>
          )}

          <div style={{ maxHeight: 210, overflowY: 'auto' }} className="kx-scroll">
            {tandas.map(t => (
              <div key={t.id} style={fila}>
                {editId === t.id ? (
                  <input autoFocus defaultValue={t.nombre}
                    onBlur={(e) => renombrar(t, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditId(null); }}
                    style={{ flex: 1, minWidth: 0, fontSize: 12.5, border: '1px solid #5B7CF5', borderRadius: 6, padding: '4px 7px', outline: 'none', fontFamily: 'inherit' }} />
                ) : (
                  <button onClick={() => cargar(t)} title="Cargar estos ítems en la checklist de esta tarea"
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1D26', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#9CA3AF' }}>{(t.items || []).length} ítems · clic para cargarla</div>
                  </button>
                )}

                {confirmar === t.id ? (
                  <>
                    <span style={{ fontSize: 10.5, color: '#9CA3AF' }}>¿Borrar?</span>
                    <button onClick={() => borrar(t)} style={{ ...iconBtn('#DC2626'), width: 'auto', padding: '0 6px', fontSize: 11, fontWeight: 700 }}>Sí</button>
                    <button onClick={() => setConfirmar(null)} style={{ ...iconBtn('#9CA3AF'), width: 'auto', padding: '0 6px', fontSize: 11, fontWeight: 600 }}>No</button>
                  </>
                ) : (
                  <>
                    {/* Pisar la tanda con lo que hay escrito ahora: es la forma natural de
                        editarla sin abrir otro editor —cargás, corregís y actualizás. */}
                    {textosActuales.length > 0 && (
                      <button onClick={() => actualizar(t)} title={`Reemplazar los ítems de "${t.nombre}" por los ${textosActuales.length} de esta tarea`} style={iconBtn('#C3C9D4')}>
                        <Save size={13} />
                      </button>
                    )}
                    <button onClick={() => setEditId(t.id)} title="Cambiar el nombre" style={iconBtn('#C3C9D4')}><Pencil size={12} /></button>
                    <button onClick={() => setConfirmar(t.id)} title="Borrar la tanda" style={iconBtn('#C3C9D4')}><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Crear una tanda con lo que ya está escrito en esta tarea. */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #EEF0F3' }}>
            {textosActuales.length === 0 ? (
              <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.45 }}>
                Escribí las subtareas acá abajo y después volvé para guardarlas como tanda.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
                  Guardar las <b>{textosActuales.length}</b> subtareas de esta tarea como tanda nueva:
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearDesdeLaTarea(); } }}
                    placeholder="Nombre (ej: Diseño de landings)"
                    style={{ flex: 1, minWidth: 0, fontSize: 12, border: '1px solid #E2E5EB', borderRadius: 8, padding: '7px 9px', outline: 'none', fontFamily: 'inherit' }} />
                  <button onClick={crearDesdeLaTarea} disabled={!nombreNuevo.trim()}
                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 11px', fontSize: 12, fontWeight: 700, color: '#fff', background: nombreNuevo.trim() ? '#5B7CF5' : '#C7CBD3', border: 'none', borderRadius: 8, cursor: nombreNuevo.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                    <Plus size={13} />Guardar
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 10.5, color: '#AEB4BF' }}>
            <Check size={11} />Las tandas son de todo el equipo.
            <button onClick={() => setAbierto(false)} style={{ marginLeft: 'auto', ...iconBtn('#C3C9D4') }}><X size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

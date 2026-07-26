/**
 * Constructor del onboarding — el editor del cuestionario que completa el
 * cliente en clientes.metodokorex.com.
 *
 * Estructura: bloque → paso → pantalla → pregunta. A la izquierda el árbol, a
 * la derecha el editor de lo seleccionado, y abajo la vista previa con los
 * estilos reales del cliente (que es lo que hace útil editar un ejemplo: se ve
 * cómo le queda).
 *
 * Escribe DIRECTO a las tablas. No hacen falta RPCs: `onboarding_bloques`,
 * `onboarding_sections` y `onboarding_questions` ya tienen RLS de equipo
 * (`using (is_team_member())`) y los grants correspondientes. El cliente nunca
 * las lee: para él todo pasa por las funciones `portal_onboarding_*`.
 *
 * DOS COSAS QUE NO SE PUEDEN EDITAR, a propósito:
 *
 *   `qkey` — es la clave con la que viven las respuestas ya dadas y con la que
 *   el documento del cerebro identifica cada bloque de texto. Renombrarla no
 *   rompe nada visible: rompe el consumo del cerebro en silencio, y eso se
 *   descubre semanas después. Se genera al crear y después es de solo lectura.
 *
 *   `target_column` — es un `<select>` cerrado a la lista blanca que está
 *   hardcodeada dentro de `onboarding_writeback`. Si fuera texto libre, el
 *   editor de preguntas se convertiría en un permiso de escritura arbitraria
 *   sobre la tabla `clients`.
 *
 * Los cambios afectan a todos los clientes EN CURSO al instante (es un catálogo
 * vivo, no versionado). Los que ya entregaron no se tocan: su run queda en
 * `completado` y ni el porcentaje ni el documento se recalculan.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@korex/db';
import { useAuth } from '@korex/auth';
import { useApp } from '../context/AppContext';
import SaveBar from '../components/settings/SaveBar';
import VistaPreviaPregunta from '../components/onboarding/VistaPreviaPregunta';
import {
  TIPOS, COLUMNAS_DESTINO, BUCKETS, ICONOS, slugQkey, vacia, vacioPaso,
} from '../components/onboarding/constantes';

const input = 'w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500 bg-white';
const label = 'block text-[11px] font-semibold text-gray-500 mb-1';

function Campo({ titulo, hint, children }) {
  return (
    <div className="mb-3">
      <span className={label}>{titulo}</span>
      {children}
      {hint && <div className="text-[10.5px] text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

export default function OnboardingBuilderPage() {
  const { user } = useAuth();
  const { flash } = useApp();
  const [params, setParams] = useSearchParams();

  const [bloques, setBloques] = useState([]);
  const [pasos, setPasos] = useState([]);
  const [preguntas, setPreguntas] = useState([]);
  const [borradas, setBorradas] = useState([]);       // qkeys a desactivar al guardar
  const [dirty, setDirty] = useState(false);
  const [cargando, setCargando] = useState(true);

  const skeySel = params.get('paso') || '';
  const qkeySel = params.get('q') || '';

  // ── Carga ──────────────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    const [b, s, q] = await Promise.all([
      supabase.from('onboarding_bloques').select('*').eq('activa', true).order('orden'),
      supabase.from('onboarding_sections').select('*').eq('activa', true).not('bkey', 'is', null).order('orden'),
      supabase.from('onboarding_questions').select('*').eq('activa', true).order('pantalla').order('orden'),
    ]);
    setBloques(b.data || []);
    setPasos(s.data || []);
    // Solo las preguntas de pasos vivos: las del catálogo viejo siguen en la
    // tabla desactivadas y no tienen por qué aparecer acá.
    const vivos = new Set((s.data || []).map((x) => x.skey));
    setPreguntas((q.data || []).filter((x) => vivos.has(x.skey)));
    setBorradas([]);
    setDirty(false);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Edición local ──────────────────────────────────────────────────────────
  const tocar = () => setDirty(true);

  const editarPaso = (skey, patch) => {
    setPasos((ps) => ps.map((p) => (p.skey === skey ? { ...p, ...patch } : p)));
    tocar();
  };
  const editarPregunta = (qkey, patch) => {
    setPreguntas((qs) => qs.map((q) => (q.qkey === qkey ? { ...q, ...patch } : q)));
    tocar();
  };
  const editarBloque = (bkey, patch) => {
    setBloques((bs) => bs.map((b) => (b.bkey === bkey ? { ...b, ...patch } : b)));
    tocar();
  };

  /** Mover una fila dentro de su grupo. Es el patrón de todos los editores. */
  const mover = (lista, setLista, filtro, id, dir, campoId) => {
    const grupo = lista.filter(filtro).sort((a, b) => a.orden - b.orden);
    const i = grupo.findIndex((x) => x[campoId] === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= grupo.length) return;
    const a = grupo[i]; const b = grupo[j];
    setLista((l) => l.map((x) => {
      if (x[campoId] === a[campoId]) return { ...x, orden: b.orden };
      if (x[campoId] === b[campoId]) return { ...x, orden: a.orden };
      return x;
    }));
    tocar();
  };

  const agregarPregunta = (skey, pantalla) => {
    const delPaso = preguntas.filter((q) => q.skey === skey);
    const base = vacia(skey, pantalla,
      Math.max(0, ...delPaso.map((q) => q.orden)) + 10);
    // La clave se genera una vez y no se vuelve a tocar.
    let n = 1;
    let qkey = `${skey}_p${delPaso.length + 1}`;
    const usadas = new Set(preguntas.map((q) => q.qkey));
    while (usadas.has(qkey)) { n += 1; qkey = `${skey}_p${delPaso.length + n}`; }
    const nueva = { ...base, qkey, nueva: true };
    setPreguntas((qs) => [...qs, nueva]);
    setParams({ paso: skey, q: qkey });
    tocar();
  };

  const duplicar = (q) => {
    const usadas = new Set(preguntas.map((x) => x.qkey));
    let qkey = `${q.qkey}_copia`;
    let n = 1;
    while (usadas.has(qkey)) { n += 1; qkey = `${q.qkey}_copia${n}`; }
    setPreguntas((qs) => [...qs, { ...q, qkey, orden: q.orden + 5, nueva: true }]);
    setParams({ paso: q.skey, q: qkey });
    tocar();
  };

  /**
   * Desactivar, nunca borrar. `onboarding_answers.qkey` no tiene FK a
   * propósito: desactivar es lo que conserva lo que el cliente ya contestó sin
   * que siga contando para el progreso.
   */
  const quitar = (q) => {
    setPreguntas((qs) => qs.filter((x) => x.qkey !== q.qkey));
    if (!q.nueva) setBorradas((b) => [...b, q.qkey]);
    setParams({ paso: q.skey });
    tocar();
  };

  // ── Guardado ───────────────────────────────────────────────────────────────
  const guardar = async () => {
    const marca = { updated_at: new Date().toISOString(), updated_by: user?.id || null };

    // Se reindexa al guardar: los ↑↓ dejan huecos y así el orden queda parejo.
    const pasosOrd = [...pasos].sort((a, b) => a.orden - b.orden)
      .map((p, i) => ({ ...p, orden: (i + 1) * 10 }));

    const preguntasOrd = [];
    pasosOrd.forEach((p) => {
      const suyas = preguntas.filter((q) => q.skey === p.skey)
        .sort((a, b) => (a.pantalla - b.pantalla) || (a.orden - b.orden));
      let pant = -1; let ord = 0;
      suyas.forEach((q) => {
        if (q.pantalla !== pant) { pant = q.pantalla; ord = 0; }
        ord += 10;
        preguntasOrd.push({ ...q, orden: ord });
      });
    });

    const limpiar = (o) => {
      const { nueva, ...resto } = o;
      return { ...resto, ...marca };
    };

    try {
      const r1 = await supabase.from('onboarding_bloques').upsert(bloques.map(limpiar));
      if (r1.error) throw r1.error;
      const r2 = await supabase.from('onboarding_sections').upsert(pasosOrd.map(limpiar));
      if (r2.error) throw r2.error;
      const r3 = await supabase.from('onboarding_questions').upsert(preguntasOrd.map(limpiar));
      if (r3.error) throw r3.error;
      if (borradas.length) {
        const r4 = await supabase.from('onboarding_questions')
          .update({ activa: false, ...marca }).in('qkey', borradas);
        if (r4.error) throw r4.error;
      }
      flash('Onboarding guardado. Los clientes lo ven en cuanto recarguen.');
      await cargar();
    } catch (e) {
      flash(`No se pudo guardar: ${e.message || e}`);
    }
  };

  // ── Selección ──────────────────────────────────────────────────────────────
  const paso = pasos.find((p) => p.skey === skeySel) || null;
  const pregunta = preguntas.find((q) => q.qkey === qkeySel) || null;
  const delPaso = useMemo(
    () => preguntas.filter((q) => q.skey === skeySel)
      .sort((a, b) => (a.pantalla - b.pantalla) || (a.orden - b.orden)),
    [preguntas, skeySel],
  );

  const totales = useMemo(() => ({
    pasos: pasos.length,
    preguntas: preguntas.length,
    obligatorias: preguntas.filter((q) => q.requerida).length,
    minutos: pasos.reduce((a, p) => a + (p.minutos || 0), 0),
  }), [pasos, preguntas]);

  if (cargando) {
    return <div className="p-6 text-[13px] text-gray-500">Cargando el onboarding…</div>;
  }

  return (
    <div className="flex gap-4 p-4 h-full min-h-0">
      {/* ── Árbol ──────────────────────────────────────────────────────────── */}
      <div className="w-[300px] flex-none overflow-y-auto pr-1">
        <div className="text-[11px] text-gray-400 mb-3">
          {totales.pasos} pasos · {totales.preguntas} preguntas ·{' '}
          {totales.obligatorias} obligatorias · {totales.minutos} min declarados
        </div>

        {bloques.map((b) => (
          <div key={b.bkey} className="mb-4">
            <button
              type="button"
              onClick={() => setParams({ bloque: b.bkey })}
              className="w-full text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 hover:text-gray-800 cursor-pointer bg-transparent border-none px-0"
            >
              {b.corto}
            </button>
            {pasos.filter((p) => p.bkey === b.bkey).sort((a, c) => a.orden - c.orden).map((p) => {
              const activo = p.skey === skeySel;
              const n = preguntas.filter((q) => q.skey === p.skey).length;
              return (
                <div key={p.skey}>
                  <div className={`flex items-center gap-1 rounded ${activo ? 'bg-blue-50' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setParams({ paso: p.skey })}
                      className="flex-1 text-left py-1.5 px-2 text-[12.5px] cursor-pointer bg-transparent border-none"
                    >
                      <span className="font-mono text-[11px] text-gray-400 mr-1.5">{p.badge}</span>
                      <span className={activo ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                        {p.titulo}
                      </span>
                      <span className="text-[10.5px] text-gray-400 ml-1.5">{n}</span>
                    </button>
                    <button type="button" title="Subir" onClick={() => mover(pasos, setPasos, (x) => x.bkey === b.bkey, p.skey, -1, 'skey')}
                      className="px-1 text-[11px] text-gray-300 hover:text-gray-700 bg-transparent border-none cursor-pointer">↑</button>
                    <button type="button" title="Bajar" onClick={() => mover(pasos, setPasos, (x) => x.bkey === b.bkey, p.skey, 1, 'skey')}
                      className="px-1 text-[11px] text-gray-300 hover:text-gray-700 bg-transparent border-none cursor-pointer">↓</button>
                  </div>

                  {activo && (
                    <div className="ml-3 border-l border-gray-200 pl-2 mb-2">
                      {delPaso.map((q, i) => {
                        const nuevaPantalla = i === 0 || delPaso[i - 1].pantalla !== q.pantalla;
                        return (
                          <div key={q.qkey}>
                            {nuevaPantalla && (
                              <div className="text-[10px] uppercase tracking-wider text-gray-300 mt-1.5 mb-0.5">
                                Pantalla {q.pantalla + 1}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => setParams({ paso: p.skey, q: q.qkey })}
                              className={`block w-full text-left py-1 px-1.5 text-[12px] rounded cursor-pointer bg-transparent border-none truncate ${
                                q.qkey === qkeySel ? 'bg-blue-100 font-semibold' : 'text-gray-600'}`}
                            >
                              {q.requerida && <span className="text-red-400 mr-1">*</span>}
                              {q.label || <em className="text-gray-400">{q.qtype}</em>}
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => agregarPregunta(p.skey,
                          delPaso.length ? delPaso[delPaso.length - 1].pantalla : 0)}
                        className="mt-1.5 text-[11px] text-blue-600 hover:text-blue-800 bg-transparent border-none cursor-pointer px-1.5"
                      >+ pregunta</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Editor ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto relative">
        {!paso && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[860px]">
            <h2 className="text-[14px] font-bold text-gray-800 mb-1">Constructor del onboarding</h2>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Elegí un paso a la izquierda para editar sus preguntas. Lo que cambies
              acá lo ven todos los clientes que estén completando el onboarding, en
              cuanto recarguen. Los que ya lo entregaron no se tocan.
            </p>
          </div>
        )}

        {paso && !pregunta && (
          <EditorPaso paso={paso} bloques={bloques} onEditar={editarPaso} />
        )}

        {pregunta && (
          <EditorPregunta
            q={pregunta} paso={paso} preguntas={preguntas}
            onEditar={editarPregunta} onDuplicar={duplicar} onQuitar={quitar}
          />
        )}

        <SaveBar dirty={dirty} onSave={guardar} onCancel={cargar} />
      </div>
    </div>
  );
}

// ── Editor de paso ───────────────────────────────────────────────────────────

function EditorPaso({ paso, bloques, onEditar }) {
  const set = (k) => (e) => onEditar(paso.skey, { [k]: e.target.value });
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[860px] relative space-y-1">
      <h2 className="text-[14px] font-bold text-gray-800 mb-3">
        Paso {paso.badge} · {paso.titulo}
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <Campo titulo="Etiqueta (badge)" hint="Lo que se ve gigante en la portada.">
          <input className={input} value={paso.badge || ''} onChange={set('badge')} />
        </Campo>
        <Campo titulo="Bloque">
          <select className={input} value={paso.bkey || ''}
                  onChange={(e) => onEditar(paso.skey, { bkey: e.target.value })}>
            {bloques.map((b) => <option key={b.bkey} value={b.bkey}>{b.nombre}</option>)}
          </select>
        </Campo>
        <Campo titulo="Minutos" hint="Lo que anuncia la portada.">
          <input type="number" className={input} value={paso.minutos ?? 0}
                 onChange={(e) => onEditar(paso.skey, { minutos: Number(e.target.value) })} />
        </Campo>
      </div>

      <Campo titulo="Antetítulo" hint="La línea chica de arriba: «Sección 7 · la más importante de todas».">
        <input className={input} value={paso.eyebrow || ''} onChange={set('eyebrow')} />
      </Campo>
      <Campo titulo="Título">
        <input className={input} value={paso.titulo || ''} onChange={set('titulo')} />
      </Campo>
      <Campo titulo="Descripción">
        <textarea className={input} rows={3} value={paso.subtitulo || ''} onChange={set('subtitulo')} />
      </Campo>
      <Campo titulo="Para qué sirve" hint="La frase grande al pie de la portada. Es lo que convence de contestar bien.">
        <textarea className={input} rows={2} value={paso.para_que || ''} onChange={set('para_que')} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo titulo="Ícono">
          <select className={input} value={paso.icono || ''} onChange={set('icono')}>
            <option value="">(sin ícono)</option>
            {ICONOS.map((i) => <option key={i.nombre} value={i.path}>{i.nombre}</option>)}
          </select>
        </Campo>
        <Campo titulo="Video del paso" hint="URL para incrustar. Si está vacío, no se muestra el reproductor.">
          <input className={input} value={paso.video_url || ''}
                 onChange={(e) => onEditar(paso.skey, { video_url: e.target.value || null })} />
        </Campo>
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-gray-700 mt-2">
        <input type="checkbox" checked={!!paso.una_por_pantalla}
               onChange={(e) => onEditar(paso.skey, { una_por_pantalla: e.target.checked })} />
        Una pregunta por pantalla
        <span className="text-[11px] text-gray-400">
          (para los pasos largos: el título de la pantalla pasa a ser la pregunta)
        </span>
      </label>
    </div>
  );
}

// ── Editor de pregunta ───────────────────────────────────────────────────────

function EditorPregunta({ q, paso, preguntas, onEditar, onDuplicar, onQuitar }) {
  const set = (k) => (e) => onEditar(q.qkey, { [k]: e.target.value });
  const setNum = (k) => (e) => onEditar(q.qkey, { [k]: e.target.value === '' ? null : Number(e.target.value) });

  const opciones = Array.isArray(q.opciones) ? q.opciones : [];
  const chips = Array.isArray(q.chips) ? q.chips : [];
  const cond = q.visible_si || null;

  // Solo puede depender de una pregunta ANTERIOR: si dependiera de una
  // posterior, el cliente vería un campo que espera algo que todavía no le
  // preguntamos.
  const anteriores = preguntas
    .filter((x) => x.qkey !== q.qkey && ['opciones', 'si_no', 'chips_multi'].includes(x.qtype))
    .filter((x) => (x.skey === q.skey ? x.orden < q.orden : true));
  const dependeDe = anteriores.find((x) => x.qkey === cond?.qkey);

  const setOpcion = (i, patch) => {
    const next = opciones.map((o, j) => (j === i ? { ...o, ...patch } : o));
    onEditar(q.qkey, { opciones: next });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[860px] relative">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <h2 className="text-[14px] font-bold text-gray-800">{q.label || '(sin título)'}</h2>
          <div className="text-[11px] text-gray-400 mt-0.5">
            <span className="font-mono">{q.qkey}</span> · {paso?.badge} {paso?.titulo}
          </div>
        </div>
        <button type="button" onClick={() => onDuplicar(q)}
          className="py-1 px-2.5 text-[11.5px] text-gray-600 border border-gray-200 rounded bg-white hover:border-gray-300 cursor-pointer">
          Duplicar
        </button>
        <button type="button" onClick={() => onQuitar(q)}
          className="py-1 px-2.5 text-[11.5px] text-red-600 border border-red-200 rounded bg-white hover:bg-red-50 cursor-pointer"
          title="Se desactiva: las respuestas ya dadas se conservan.">
          Quitar
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Campo titulo="Tipo">
          <select className={input} value={q.qtype} onChange={set('qtype')}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Campo>
        <Campo titulo="Pantalla" hint="Mismo número = misma pantalla.">
          <input type="number" className={input} value={q.pantalla ?? 0}
                 onChange={(e) => onEditar(q.qkey, { pantalla: Number(e.target.value) })} />
        </Campo>
        <Campo titulo="Largo pedido" hint="0 = sin medidor ni micrófono. Cuenta al 60%.">
          <input type="number" className={input} value={q.largo_objetivo ?? 0}
                 onChange={(e) => onEditar(q.qkey, { largo_objetivo: Number(e.target.value) })} />
        </Campo>
        <div className="pt-5">
          <label className="flex items-center gap-2 text-[12.5px] text-gray-700">
            <input type="checkbox" checked={!!q.requerida}
                   onChange={(e) => onEditar(q.qkey, { requerida: e.target.checked })} />
            Obligatoria
          </label>
        </div>
      </div>

      <Campo titulo="Pregunta">
        <textarea className={input} rows={2} value={q.label || ''} onChange={set('label')} />
      </Campo>
      <Campo titulo="Aclaración" hint="La línea gris debajo de la pregunta.">
        <textarea className={input} rows={2} value={q.sublabel || ''} onChange={set('sublabel')} />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo titulo="Cabecera" hint="Separador con título dentro de la pantalla.">
          <input className={input} value={q.cabecera || ''} onChange={set('cabecera')} />
        </Campo>
        <Campo titulo="Bajada de la cabecera">
          <input className={input} value={q.cabecera_sub || ''} onChange={set('cabecera_sub')} />
        </Campo>
      </div>

      {q.qtype === 'info' ? (
        <>
          <Campo titulo="Kicker"><input className={input} value={q.info_kicker || ''} onChange={set('info_kicker')} /></Campo>
          <Campo titulo="Título de la tarjeta"><input className={input} value={q.info_titulo || ''} onChange={set('info_titulo')} /></Campo>
          <Campo titulo="Cuerpo"><textarea className={input} rows={4} value={q.info_cuerpo || ''} onChange={set('info_cuerpo')} /></Campo>
        </>
      ) : (
        <>
          <Campo titulo="Ejemplo"
                 hint="LA VARA: es contra esto que el cliente calibra cuánto escribir. Solo se muestra si hay largo pedido.">
            <textarea className={input} rows={6} value={q.ejemplo || ''} onChange={set('ejemplo')} />
          </Campo>
          <Campo titulo="Texto de ayuda dentro del campo (placeholder)">
            <input className={input} value={q.placeholder || ''} onChange={set('placeholder')} />
          </Campo>
          <Campo titulo="Acordate de contar" hint="Uno por línea. Aparecen como pastillas sobre el campo.">
            <textarea className={input} rows={3} value={chips.join('\n')}
                      onChange={(e) => onEditar(q.qkey, {
                        chips: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                      })} />
          </Campo>
        </>
      )}

      {['opciones', 'si_no', 'chips_multi'].includes(q.qtype) && (
        <div className="mb-3">
          <span className={label}>Opciones</span>
          {opciones.map((o, i) => (
            <div key={o.value || i} className="flex items-center gap-1.5 mb-1.5">
              <input className={`${input} w-[140px] font-mono text-[11.5px]`} value={o.value || ''}
                     placeholder="clave" onChange={(e) => setOpcion(i, { value: e.target.value })} />
              <input className={input} value={o.label || ''} placeholder="Lo que ve el cliente"
                     onChange={(e) => setOpcion(i, { label: e.target.value })} />
              <input className={input} value={o.hint || ''} placeholder="Aclaración (opcional)"
                     onChange={(e) => setOpcion(i, { hint: e.target.value })} />
              <button type="button" onClick={() => onEditar(q.qkey, {
                opciones: opciones.filter((_, j) => j !== i),
              })} className="px-1.5 text-[12px] text-gray-400 hover:text-red-600 bg-transparent border-none cursor-pointer">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => onEditar(q.qkey, {
            opciones: [...opciones, { value: `op${opciones.length + 1}`, label: '', hint: '' }],
          })} className="text-[11.5px] text-blue-600 hover:text-blue-800 bg-transparent border-none cursor-pointer px-0">
            + opción
          </button>
          {q.qtype === 'chips_multi' && (
            <div className="mt-2">
              <Campo titulo="Máximo que se pueden marcar" hint="Vacío = sin tope. 1 = se comporta como selector.">
                <input type="number" className={`${input} w-[120px]`} value={q.max_opciones ?? ''}
                       onChange={setNum('max_opciones')} />
              </Campo>
            </div>
          )}
        </div>
      )}

      {(q.qtype === 'archivos' || q.qtype === 'subida') && (
        <div className="grid grid-cols-2 gap-3">
          <Campo titulo="Carpeta de recursos" hint="Adónde cae el archivo en el panel del cliente.">
            <select className={input} value={q.bucket_key || ''}
                    onChange={(e) => onEditar(q.qkey, { bucket_key: e.target.value || null })}>
              <option value="">(elegir)</option>
              {BUCKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </Campo>
          <Campo titulo="Cuántos pide" hint="Vacío = con uno alcanza.">
            <input type="number" className={input} value={q.target_count ?? ''} onChange={setNum('target_count')} />
          </Campo>
          <Campo titulo="Texto del botón">
            <input className={input} value={q.archivo_cta || ''} onChange={set('archivo_cta')} />
          </Campo>
          <Campo titulo="Aclaración del botón">
            <input className={input} value={q.archivo_hint || ''} onChange={set('archivo_hint')} />
          </Campo>
        </div>
      )}

      {/* ── Condición ─────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-3 mt-3">
        <span className={label}>Cuándo se muestra</span>
        <div className="flex items-center gap-2">
          <select className={`${input} w-[300px]`} value={cond?.qkey || ''}
                  onChange={(e) => onEditar(q.qkey, {
                    visible_si: e.target.value ? { qkey: e.target.value, in: [] } : null,
                  })}>
            <option value="">Siempre</option>
            {anteriores.map((x) => (
              <option key={x.qkey} value={x.qkey}>{x.label || x.qkey}</option>
            ))}
          </select>
          {dependeDe && (
            <div className="flex flex-wrap gap-1.5">
              {(Array.isArray(dependeDe.opciones) ? dependeDe.opciones : []).map((o) => {
                const activa = (cond.in || []).includes(o.value);
                return (
                  <button key={o.value} type="button" onClick={() => onEditar(q.qkey, {
                    visible_si: {
                      qkey: cond.qkey,
                      in: activa ? cond.in.filter((v) => v !== o.value) : [...(cond.in || []), o.value],
                    },
                  })} className={`py-1 px-2 text-[11.5px] rounded-full border cursor-pointer ${
                    activa ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                    {o.label || o.value}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {cond && !(cond.in || []).length && (
          <div className="text-[11px] text-amber-600 mt-1">
            Elegí al menos una respuesta, o la pregunta no se va a mostrar nunca.
          </div>
        )}
      </div>

      {/* ── Destino ───────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-3 mt-3">
        <span className={label}>Además de al documento, ¿escribe a alguna columna?</span>
        <select className={`${input} w-[420px]`}
                value={q.target_kind ? `${q.target_kind}.${q.target_column}` : ''}
                onChange={(e) => {
                  const [kind, col] = e.target.value.split('.');
                  onEditar(q.qkey, {
                    target_kind: kind || null,
                    target_column: col || null,
                  });
                }}>
          <option value="">Solo al documento</option>
          {COLUMNAS_DESTINO.map((c) => (
            <option key={`${c.kind}.${c.col}`} value={`${c.kind}.${c.col}`}>{c.label}</option>
          ))}
        </select>
        <div className="text-[10.5px] text-gray-400 mt-1">
          La lista está acotada a las columnas que el write-back sabe escribir. Para
          agregar una nueva hace falta una migración: es a propósito.
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4 mt-4">
        <span className={label}>Cómo lo ve el cliente</span>
        <VistaPreviaPregunta q={q} />
      </div>
    </div>
  );
}

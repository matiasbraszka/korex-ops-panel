/**
 * Genera portal_v29_onboarding_v2_catalogo.sql desde el fuente del HTML.
 *
 * Se genera y no se escribe a mano porque son 119 preguntas con ejemplos de
 * hasta 900 caracteres: transcribir eso a mano garantiza que el catálogo de la
 * base y el HTML entregado se separen en algún punto, y ese punto no se
 * descubre nunca — se descubre cuando un cliente ve una pregunta distinta.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'docs', 'onboarding-v2-fuente.jsx');
const OUT = path.join(__dirname, 'portal_v29_onboarding_v2_catalogo.sql');

// ── cargar BLOCKS / STEPS / ICONS / WHY del fuente ───────────────────────────
const src = fs.readFileSync(SRC, 'utf8');
const cut = src.indexOf('const DOW =');
const mod = {};
eval(src.slice(0, cut) + '\nmod.BLOCKS=BLOCKS;mod.STEPS=STEPS;mod.ICONS=ICONS;mod.WHY=WHY;');
const { BLOCKS, STEPS, ICONS, WHY } = mod;

// ── helpers SQL ──────────────────────────────────────────────────────────────
const q = (v) => (v === null || v === undefined || v === '' ? "''" : "'" + String(v).replace(/'/g, "''") + "'");
const qn = (v) => (v === null || v === undefined || v === '' ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");
const jb = (v) => q(JSON.stringify(v)) + '::jsonb';
const b = (v) => (v ? 'true' : 'false');
const n = (v) => (v === null || v === undefined ? 'null' : String(v));

// ── condiciones: de función JS a visible_si jsonb ────────────────────────────
// Las 13 condiciones del HTML son todas de la forma `a.X === 'v'` (o un OR de
// dos valores de la MISMA pregunta). Se extraen por regex y se verifica que no
// haya ninguna que mezcle dos preguntas distintas: si apareciera, el formato
// {qkey, in:[...]} no la puede representar y hay que enterarse acá, no en
// producción con el cliente mirando una pregunta que no corresponde.
function visibleSi(fn, qkey) {
  if (!fn) return null;
  const s = String(fn);
  const m = [...s.matchAll(/a\.(\w+)\s*===\s*'([^']*)'/g)];
  if (!m.length) throw new Error(`No pude leer la condición de ${qkey}: ${s}`);
  const claves = [...new Set(m.map((x) => x[1]))];
  if (claves.length > 1) throw new Error(`La condición de ${qkey} mezcla ${claves.join(' y ')}; visible_si no lo soporta`);
  return { qkey: claves[0], in: m.map((x) => x[2]) };
}

// ── tipo del HTML → qtype ────────────────────────────────────────────────────
const QTYPE = {
  o: 'abierta', a: 'abierta', s: 'corta', p: 'opciones', c: 'chips_multi',
  chk: 'checklist', f: 'archivos', bud: 'presupuesto', sch: 'agenda',
  sum: 'resumen', i: 'info',
};

// ── a qué columna de operaciones escribe cada respuesta ──────────────────────
// Solo columnas de la lista blanca que ya está hardcodeada dentro de
// onboarding_writeback(). Cualquier otra cosa cae en v_skips y no escribe nada.
//
// La regla para mapear una pregunta a una columna: la respuesta tiene que tener
// la MISMA forma que la columna. Tres del v1 no la tenían y quedaron afuera:
//
//   producto_mercado → clients.niche      la respuesta es un párrafo de 200
//                                         caracteres y `niche` se muestra como
//                                         etiqueta en el listado de clientes
//   equipo_nombre    → clients.team_name  la pregunta es "¿cómo surgió?", así
//                                         que la respuesta es una anécdota, no
//                                         un nombre
//   tipografia       → clients.brand_font el valor es 'si'/'no', no el nombre
//                                         de una tipografía
//
// Escribir eso en columnas que el equipo lee de un vistazo ensucia el panel y
// después nadie sabe de dónde salió. Van al documento y listo.
const TARGET = {
  negocio_nombre:  ['clients', 'company', 'fill'],
  presupuesto:     ['clients', 'ads_budget_monthly', 'overwrite'],
  paleta_detalle:  ['clients', 'brand_colors', 'overwrite'],
  whatsapp:        ['strategy_pages', 'whatsapp_leads', 'overwrite'],
  dominio:         ['strategy_pages', 'official_domain', 'fill'],
  foco:            ['strategy_pages', 'tipo', 'fill'],
  por_que_contigo: ['strategy_pages', 'punto_dif', 'fill'],
};

// ── archivos → carpeta de recursos del cliente ───────────────────────────────
const BUCKET = {
  material_branding:      ['branding', null],
  material_autoridad:     ['autoridad', 5],
  material_lifestyle:     ['estilo_vida', null],
  material_producto:      ['productos', null],
  material_empresa_files: ['empresa', null],
  material_testimonios:   ['testimonios', null],
};

// ── el campo que agrego: el HTML promete subir logo/branding y no da dónde ───
const BRANDING = {
  k: 'material_branding', t: 'f', multiple: true, accept: 'image/*,.pdf,.ai,.svg,.eps',
  head: 'Tu marca', headSub: 'Si tenés logo, paleta o tipografía propios, subilos acá y los usamos tal cual.',
  label: 'Logo, colores y tipografía', sub: 'Lo mejor es el logo en PNG con fondo transparente o el archivo original.',
  fileCta: 'Subí tu logo y tu branding', fileHint: 'PNG, SVG, AI o el PDF de manual de marca.',
};

const bloques = [];
const pasos = [];
const preguntas = [];

BLOCKS.forEach((bl, bi) => {
  bloques.push({
    bkey: 'b' + (bi + 1), orden: (bi + 1) * 10, nombre: bl.name, corto: bl.short,
    titulo: bl.title, descripcion: bl.desc,
    // El bloque —no el paso— es lo que abre pestañas del portal.
    desbloquea: bi === 1 ? ['/guiones', '/embudos'] : bi === 3 ? ['/material'] : [],
  });
});

STEPS.forEach((st, si) => {
  const skey = 'p' + String(st.badge).toLowerCase();
  let visibles = 0;

  st.screens.forEach((sc, pi) => {
    sc.fields.forEach((f, fi) => {
      const esInfo = f.t === 'i';
      const qkey = esInfo ? `info_${String(st.badge).toLowerCase()}_${pi}_${fi}` : f.k;
      if (!esInfo && f.t !== 'sum') visibles++;

      const largo = f.len || 0;
      const [tKind, tCol, tMode] = TARGET[qkey] || [null, null, 'fill'];
      const [bucket, target] = BUCKET[qkey] || [null, null];

      preguntas.push({
        qkey, skey, pantalla: pi, orden: (fi + 1) * 10,
        label: esInfo ? (f.infoTitle || 'Información') : (f.label || ''),
        sublabel: f.sub || '',
        cabecera: f.head || '', cabecera_sub: f.headSub || '',
        ejemplo: f.ex || '', placeholder: f.ph || '',
        chips: f.rem || [],
        qtype: QTYPE[f.t],
        opciones: (f.opts || []).map((o) => ({ value: o.v, label: o.label, hint: o.desc || '' })),
        // El micrófono aparece cuando hay un largo que alcanzar: es el mecanismo
        // que resuelve las respuestas de tres líneas, no un adorno.
        voz: !!largo,
        requerida: !!f.req,
        largo_objetivo: largo,
        max_opciones: f.max || null,
        input_mode: f.inputMode || '',
        min_altura: f.t === 'o' ? 180 : (f.minH || null),
        info_kicker: f.infoKicker || '', info_titulo: f.infoTitle || '', info_cuerpo: f.infoBody || '',
        archivo_cta: f.fileCta || '', archivo_hint: f.fileHint || '',
        archivo_accept: f.accept || '', archivo_multiple: f.multiple !== false,
        solo_dia: !!f.soloDia,
        visible_si: visibleSi(f.cond, qkey),
        bucket_key: bucket, target_count: target,
        target_kind: tKind, target_column: tCol, target_mode: tMode,
        peso: esInfo || f.t === 'sum' ? 0 : 1,
        plantilla_ord: (si + 1) * 100 + (pi * 20 + fi + 1),
        plantilla_ref: st.badge + ' · ' + st.title,
      });

      // El dropzone que falta, insertado justo ANTES de las fotos de autoridad.
      if (qkey === 'material_autoridad') {
        preguntas.splice(preguntas.length - 1, 0, {
          qkey: BRANDING.k, skey, pantalla: pi, orden: 5,
          label: BRANDING.label, sublabel: BRANDING.sub,
          cabecera: BRANDING.head, cabecera_sub: BRANDING.headSub,
          ejemplo: '', placeholder: '', chips: [], qtype: 'archivos', opciones: [],
          voz: false, requerida: false, largo_objetivo: 0, max_opciones: null,
          input_mode: '', min_altura: null,
          info_kicker: '', info_titulo: '', info_cuerpo: '',
          archivo_cta: BRANDING.fileCta, archivo_hint: BRANDING.fileHint,
          archivo_accept: BRANDING.accept, archivo_multiple: true, solo_dia: false,
          visible_si: null, bucket_key: 'branding', target_count: null,
          target_kind: null, target_column: null, target_mode: 'fill', peso: 1,
          plantilla_ord: (si + 1) * 100 + pi * 20,
          plantilla_ref: st.badge + ' · ' + st.title,
        });
      }
    });
  });

  pasos.push({
    skey, bkey: 'b' + (st.b + 1), orden: (si + 1) * 10,
    badge: st.badge, eyebrow: st.eyebrow, titulo: st.title, subtitulo: st.desc,
    para_que: WHY[st.badge] || '',
    icono: ICONS[st.badge] || '',
    una_por_pantalla: !!st.hist,
    // El mismo cálculo del prototipo (preguntas × 1,4), para que el número que
    // ve el cliente sea idéntico al del HTML entregado. Queda editable desde el
    // constructor, que es donde corresponde ajustarlo cuando se mida de verdad.
    minutos: Math.max(1, Math.round(visibles * 1.4)),
    // El v2 no tiene pantallas de "podés parar acá": el pie es siempre
    // Atrás/Continuar y el progreso se guarda solo. La columna queda en false
    // para no dejar dato que nadie lee.
    checkpoint: false,
  });
});

// ── verificaciones antes de emitir ───────────────────────────────────────────
const claves = preguntas.map((p) => p.qkey);
const dup = claves.filter((k, i) => claves.indexOf(k) !== i);
if (dup.length) throw new Error('qkey duplicadas: ' + [...new Set(dup)].join(', '));

const set = new Set(claves);
preguntas.forEach((p) => {
  if (p.visible_si && !set.has(p.visible_si.qkey)) {
    throw new Error(`${p.qkey} depende de ${p.visible_si.qkey}, que no existe`);
  }
});

// Una condición que mira una pregunta POSTERIOR deja al cliente frente a un
// campo que depende de algo que todavía no contestó.
const pos = {};
preguntas.forEach((p, i) => { pos[p.qkey] = i; });
preguntas.forEach((p) => {
  if (p.visible_si && pos[p.visible_si.qkey] > pos[p.qkey]) {
    throw new Error(`${p.qkey} depende de ${p.visible_si.qkey}, que viene después`);
  }
});

// ── emitir ───────────────────────────────────────────────────────────────────
const L = [];
L.push(`-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v29_onboarding_v2_catalogo.sql
--
-- GENERADO por scratchpad/gen-catalogo.cjs desde el fuente de
-- onboarding-korex-standalone.html. No editar a mano: para cambiar el catálogo
-- se usa el constructor de /admin/onboarding, que setea updated_by y por eso
-- queda protegido del \`on conflict ... where updated_by is null\` de abajo.
--
-- ${bloques.length} bloques · ${pasos.length} pasos · ${preguntas.length} preguntas
-- (${preguntas.filter((p) => p.requerida).length} obligatorias, ${preguntas.filter((p) => p.visible_si).length} condicionales,
--  ${preguntas.filter((p) => p.largo_objetivo).length} con micrófono, ${preguntas.filter((p) => p.ejemplo).length} con ejemplo)
--
-- El catálogo v1 (7 tramos / 66 preguntas) se DESACTIVA, no se borra:
-- onboarding_answers.qkey no tiene FK a propósito, así que las respuestas del
-- cliente de prueba sobreviven y simplemente dejan de contar para el progreso.
--
-- Además de las preguntas del HTML va una que no está en él: material_branding.
-- El paso 18 ofrece "Tengo logo, lo subo en PNG", "Tengo branding, lo adjunto"
-- y "Tengo tipografía, la subo a la carpeta", pero ninguna pantalla del
-- prototipo tiene dónde subirlo. Dejar tres promesas sin destino es peor que
-- agregar un dropzone opcional.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · Baja el catálogo v1 ──────────────────────────────────────────────────
update public.onboarding_questions set activa = false, updated_at = now()
 where activa and skey in (select skey from public.onboarding_sections where bkey is null);
update public.onboarding_sections set activa = false, updated_at = now()
 where activa and bkey is null;
`);

// Un INSERT por tabla con todas las filas y un solo ON CONFLICT, en vez de 125
// statements repitiendo el mismo bloque de 30 líneas. Mismo resultado, un
// tercio del tamaño, y el archivo se puede leer de arriba a abajo.
const COLS_B = 'bkey, orden, nombre, corto, titulo, descripcion, desbloquea, activa';
const SET_B = `orden = excluded.orden, nombre = excluded.nombre, corto = excluded.corto,
  titulo = excluded.titulo, descripcion = excluded.descripcion,
  desbloquea = excluded.desbloquea, activa = true, updated_at = now()`;

L.push('-- ── 2 · Bloques ──────────────────────────────────────────────────────────────');
L.push(`insert into public.onboarding_bloques (${COLS_B}) values`);
L.push(bloques.map((x) =>
  `  (${q(x.bkey)}, ${x.orden}, ${q(x.nombre)}, ${q(x.corto)}, ${q(x.titulo)}, ${q(x.descripcion)}, ${q('{' + x.desbloquea.join(',') + '}')}::text[], true)`
).join(',\n'));
L.push(`on conflict (bkey) do update set ${SET_B}\n where public.onboarding_bloques.updated_by is null;\n`);

const COLS_S = `skey, bkey, orden, badge, eyebrow, titulo, subtitulo, para_que, icono,
   una_por_pantalla, minutos, checkpoint, promesa, intro_md, activa`;
const SET_S = `bkey = excluded.bkey, orden = excluded.orden, badge = excluded.badge,
  eyebrow = excluded.eyebrow, titulo = excluded.titulo, subtitulo = excluded.subtitulo,
  para_que = excluded.para_que, icono = excluded.icono,
  una_por_pantalla = excluded.una_por_pantalla, minutos = excluded.minutos,
  checkpoint = excluded.checkpoint, activa = true, updated_at = now()`;

L.push('-- ── 3 · Pasos ────────────────────────────────────────────────────────────────');
L.push(`insert into public.onboarding_sections (${COLS_S}) values`);
L.push(pasos.map((x) =>
  `  (${q(x.skey)}, ${q(x.bkey)}, ${x.orden}, ${q(x.badge)}, ${q(x.eyebrow)}, ${q(x.titulo)}, ${q(x.subtitulo)}, ${q(x.para_que)}, ${q(x.icono)}, ${b(x.una_por_pantalla)}, ${x.minutos}, ${b(x.checkpoint)}, '', '', true)`
).join(',\n'));
L.push(`on conflict (skey) do update set ${SET_S}\n where public.onboarding_sections.updated_by is null;\n`);

const COLS_Q = `qkey, skey, pantalla, orden, label, sublabel, cabecera, cabecera_sub, ejemplo, placeholder,
   chips, qtype, opciones, voz, requerida, min_chars, largo_objetivo, max_opciones, input_mode, min_altura,
   info_kicker, info_titulo, info_cuerpo, archivo_cta, archivo_hint, archivo_accept, archivo_multiple,
   solo_dia, visible_si, bucket_key, target_count, target_kind, target_column, target_mode,
   peso, minutos, plantilla_ord, plantilla_ref, ayuda_md, activa`;
const SET_Q = `skey = excluded.skey, pantalla = excluded.pantalla, orden = excluded.orden,
  label = excluded.label, sublabel = excluded.sublabel, cabecera = excluded.cabecera,
  cabecera_sub = excluded.cabecera_sub, ejemplo = excluded.ejemplo, placeholder = excluded.placeholder,
  chips = excluded.chips, qtype = excluded.qtype, opciones = excluded.opciones,
  voz = excluded.voz, requerida = excluded.requerida, min_chars = 0,
  largo_objetivo = excluded.largo_objetivo, max_opciones = excluded.max_opciones,
  input_mode = excluded.input_mode, min_altura = excluded.min_altura,
  info_kicker = excluded.info_kicker, info_titulo = excluded.info_titulo, info_cuerpo = excluded.info_cuerpo,
  archivo_cta = excluded.archivo_cta, archivo_hint = excluded.archivo_hint,
  archivo_accept = excluded.archivo_accept, archivo_multiple = excluded.archivo_multiple,
  solo_dia = excluded.solo_dia, visible_si = excluded.visible_si,
  bucket_key = excluded.bucket_key, target_count = excluded.target_count,
  target_kind = excluded.target_kind, target_column = excluded.target_column,
  target_mode = excluded.target_mode, peso = excluded.peso,
  plantilla_ord = excluded.plantilla_ord, plantilla_ref = excluded.plantilla_ref,
  activa = true, updated_at = now()`;

const filaQ = (p) =>
  `  (${q(p.qkey)}, ${q(p.skey)}, ${p.pantalla}, ${p.orden}, ${q(p.label)}, ${q(p.sublabel)}, ${q(p.cabecera)}, ${q(p.cabecera_sub)}, ${q(p.ejemplo)}, ${q(p.placeholder)},
   ${jb(p.chips)}, ${q(p.qtype)}, ${jb(p.opciones)}, ${b(p.voz)}, ${b(p.requerida)}, 0, ${p.largo_objetivo}, ${n(p.max_opciones)}, ${q(p.input_mode)}, ${n(p.min_altura)},
   ${q(p.info_kicker)}, ${q(p.info_titulo)}, ${q(p.info_cuerpo)}, ${q(p.archivo_cta)}, ${q(p.archivo_hint)}, ${q(p.archivo_accept)}, ${b(p.archivo_multiple)},
   ${b(p.solo_dia)}, ${p.visible_si ? jb(p.visible_si) : 'null'}, ${qn(p.bucket_key)}, ${n(p.target_count)}, ${qn(p.target_kind)}, ${qn(p.target_column)}, ${q(p.target_mode)},
   ${p.peso}, 1, ${p.plantilla_ord}, ${q(p.plantilla_ref)}, '', true)`;

L.push('-- ── 4 · Preguntas ────────────────────────────────────────────────────────────');
L.push(`insert into public.onboarding_questions (${COLS_Q}) values`);
L.push(preguntas.map(filaQ).join(',\n'));
L.push(`on conflict (qkey) do update set ${SET_Q}\n where public.onboarding_questions.updated_by is null;\n`);

// El orden del documento se DERIVA de la base, no de una fórmula del generador.
// La primera versión calculaba paso*100 + pantalla*20 + orden y se desbordaba:
// el paso 09 tiene 15 pantallas, así que sus últimas preguntas invadían el rango
// del paso 10 y las dos secciones se intercalaban en el documento del DEL.
L.push(`-- ── 5 · Orden del documento, derivado ────────────────────────────────────────
update public.onboarding_questions q
   set plantilla_ord = s.orden * 1000 + q.pantalla * 20 + (q.orden / 10),
       plantilla_ref = s.badge || ' · ' || s.titulo,
       updated_at    = now()
  from public.onboarding_sections s
 where s.skey = q.skey and s.bkey is not null and q.activa;

commit;

notify pgrst, 'reload schema';
`);

fs.writeFileSync(OUT, L.join('\n'));


console.log(`${OUT}
${bloques.length} bloques · ${pasos.length} pasos · ${preguntas.length} preguntas ` +
  `(${preguntas.filter((p) => p.requerida).length} obligatorias, ` +
  `${preguntas.filter((p) => p.visible_si).length} condicionales, ` +
  `${preguntas.filter((p) => p.largo_objetivo).length} con micrófono)
minutos declarados: ${pasos.reduce((a, p) => a + p.minutos, 0)}`);

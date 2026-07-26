/**
 * Genera la copia local del catálogo para el MODO PRUEBA del portal.
 *
 * Sale del mismo fuente que el catálogo de la base (docs/onboarding-v2-fuente.jsx),
 * con la misma forma que devuelve `portal_onboarding_catalogo()`. Así el modo
 * prueba se puede recorrer sin sesión y sin tocar la base: es para mirar el
 * onboarding entero, no para probar la integración.
 *
 *   node migrations/portal_v29_generador_json.cjs
 *
 * Si el catálogo real se edita desde /admin/onboarding, esta copia queda vieja.
 * No importa: sirve para ver el flujo y el diseño, y se regenera corriendo esto.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'docs', 'onboarding-v2-fuente.jsx');
const OUT = path.join(__dirname, '..', 'apps', 'portal', 'src', 'onboarding', 'catalogoPrueba.json');

const src = fs.readFileSync(SRC, 'utf8');
const cut = src.indexOf('const DOW =');
const mod = {};
// eslint-disable-next-line no-eval
eval(`${src.slice(0, cut)}\nmod.BLOCKS=BLOCKS;mod.STEPS=STEPS;mod.ICONS=ICONS;mod.WHY=WHY;`);
const { BLOCKS, STEPS, ICONS, WHY } = mod;

const QTYPE = {
  o: 'abierta', a: 'abierta', s: 'corta', p: 'opciones', c: 'chips_multi',
  f: 'archivos', bud: 'presupuesto', sch: 'agenda', sum: 'resumen', i: 'info',
};
const BUCKET = {
  material_branding: ['branding', null], material_autoridad: ['autoridad', 5],
  material_lifestyle: ['estilo_vida', null], material_producto: ['productos', null],
  material_empresa_files: ['empresa', null], material_testimonios: ['testimonios', null],
};

function visibleSi(fn) {
  if (!fn) return null;
  const m = [...String(fn).matchAll(/a\.(\w+)\s*===\s*'([^']*)'/g)];
  if (!m.length) return null;
  return { qkey: m[0][1], in: m.map((x) => x[2]) };
}

const bloques = BLOCKS.map((b, i) => ({
  bkey: `b${i + 1}`, nombre: b.name, corto: b.short, titulo: b.title,
  descripcion: b.desc,
  desbloquea: i === 1 ? ['/guiones', '/embudos'] : i === 3 ? ['/material'] : [],
}));

const pasos = STEPS.map((st, si) => {
  const skey = `p${String(st.badge).toLowerCase()}`;
  const preguntas = [];
  let visibles = 0;

  st.screens.forEach((sc, pi) => {
    sc.fields.forEach((f, fi) => {
      const esInfo = f.t === 'i';
      const qkey = esInfo ? `info_${String(st.badge).toLowerCase()}_${pi}_${fi}` : f.k;
      if (!esInfo && f.t !== 'sum') visibles += 1;
      const [bucket, target] = BUCKET[qkey] || [null, null];

      if (qkey === 'material_autoridad') {
        preguntas.push({
          qkey: 'material_branding', pantalla: pi,
          label: 'Logo, colores y tipografía',
          sublabel: 'Lo mejor es el logo en PNG con fondo transparente o el archivo original.',
          cabecera: 'Tu marca',
          cabeceraSub: 'Si tenés logo, paleta o tipografía propios, subilos acá y los usamos tal cual.',
          ayuda: '', ejemplo: '', chips: [], placeholder: '', video: null,
          tipo: 'archivos', opciones: [], voz: false, requerida: false, largo: 0,
          maxOpciones: null, inputMode: '', minAltura: null, soloDia: false,
          infoKicker: '', infoTitulo: '', infoCuerpo: '',
          archivoCta: 'Subí tu logo y tu branding',
          archivoHint: 'PNG, SVG, AI o el PDF de manual de marca.',
          archivoAccept: 'image/*,.pdf,.ai,.svg,.eps', archivoMultiple: true,
          visibleSi: null, bucket: 'branding', target: null,
        });
      }

      preguntas.push({
        qkey, pantalla: pi,
        label: esInfo ? (f.infoTitle || 'Información') : (f.label || ''),
        sublabel: f.sub || '',
        cabecera: f.head || '', cabeceraSub: f.headSub || '',
        ayuda: '', ejemplo: f.ex || '', chips: f.rem || [],
        placeholder: f.ph || '', video: null,
        tipo: QTYPE[f.t], voz: !!f.len, requerida: !!f.req, largo: f.len || 0,
        opciones: (f.opts || []).map((o) => ({ value: o.v, label: o.label, hint: o.desc || '' })),
        maxOpciones: f.max || null, inputMode: f.inputMode || '',
        minAltura: f.t === 'o' ? 180 : (f.minH || null), soloDia: !!f.soloDia,
        infoKicker: f.infoKicker || '', infoTitulo: f.infoTitle || '', infoCuerpo: f.infoBody || '',
        archivoCta: f.fileCta || '', archivoHint: f.fileHint || '',
        archivoAccept: f.accept || '', archivoMultiple: f.multiple !== false,
        visibleSi: visibleSi(f.cond), bucket, target,
      });
    });
  });

  return {
    skey, bkey: `b${st.b + 1}`, badge: st.badge, eyebrow: st.eyebrow,
    titulo: st.title, subtitulo: st.desc, paraQue: WHY[st.badge] || '',
    icono: ICONS[st.badge] || '', video: null,
    minutos: Math.max(1, Math.round(visibles * 1.4)),
    unaPorPantalla: !!st.hist,
    preguntas,
  };
});

fs.writeFileSync(OUT, `${JSON.stringify({
  version: 'prueba', videoBienvenida: '', bloques, pasos,
}, null, 1)}\n`);

console.log(OUT);
console.log(`${bloques.length} bloques · ${pasos.length} pasos · `
  + `${pasos.reduce((a, p) => a + p.preguntas.length, 0)} preguntas`);

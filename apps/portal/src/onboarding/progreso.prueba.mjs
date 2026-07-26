// Comprueba que progreso.js implementa exactamente las mismas reglas que
// _onboarding_lleno() y _onboarding_visible() en la base. Si estas dos
// divergen, el cliente ve un porcentaje y el operador ve otro.
import {
  visible, lleno, minLargo, calcularProgreso, pantallasDe, nodos, medidor, statsPaso,
} from './onb-wt/apps/portal/src/onboarding/progreso.js';

let fallos = 0;
const ok = (nombre, cond) => {
  if (!cond) { fallos += 1; console.log('  FALLA  ' + nombre); }
  else console.log('  ok     ' + nombre);
};

// ── visible(): la condición se resuelve contra el VALOR, no la etiqueta ──────
const qCond = { qkey: 'x', visibleSi: { qkey: 'foco', in: ['ambas_op', 'ambas_prod'] } };
ok('sin respuesta no se ve', !visible(qCond, {}));
ok('valor en el json la muestra',
  visible(qCond, { foco: { valor: 'Ambas — primero oportunidad', valorJson: { valor: 'ambas_op' } } }));
ok('etiqueta sola NO la muestra (era el bug del v1)',
  !visible(qCond, { foco: { valor: 'Ambas — primero oportunidad' } }));
ok('otro valor no la muestra',
  !visible(qCond, { foco: { valor: 'Venta de producto 100%', valorJson: { valor: 'prod100' } } }));
ok('multiple: alcanza con uno de la lista',
  visible({ visibleSi: { qkey: 'a', in: ['b'] } }, { a: { valorJson: { valores: ['z', 'b'] } } }));
ok('sin condicion siempre se ve', visible({ qkey: 'y' }, {}));

// ── lleno(): binario al 60% ─────────────────────────────────────────────────
const q900 = { qkey: 'h1', tipo: 'abierta', largo: 900 };
ok('minLargo de 900 es 540', minLargo(q900) === 540);
ok('539 caracteres NO alcanza', !lleno(q900, { h1: { valor: 'x'.repeat(539) } }, []));
ok('540 caracteres SI alcanza', lleno(q900, { h1: { valor: 'x'.repeat(540) } }, []));
ok('vacio no alcanza', !lleno(q900, {}, []));

const qCorta = { qkey: 'c', tipo: 'corta', largo: 0 };
ok('texto corto: con un caracter alcanza', lleno(qCorta, { c: { valor: 'a' } }, []));
ok('texto corto: espacios no cuentan', !lleno(qCorta, { c: { valor: '   ' } }, []));

const qArch = { qkey: 'f', tipo: 'archivos', bucket: 'autoridad', target: 5 };
ok('archivos: 4 de 5 no alcanza', !lleno(qArch, {}, [{ bucket: 'autoridad', subidos: 4 }]));
ok('archivos: 5 de 5 alcanza', lleno(qArch, {}, [{ bucket: 'autoridad', subidos: 5 }]));
ok('archivos sin target: con uno alcanza',
  lleno({ qkey: 'g', tipo: 'archivos', bucket: 'b' }, {}, [{ bucket: 'b', subidos: 1 }]));
ok('info siempre cuenta como llena', lleno({ qkey: 'i', tipo: 'info' }, {}, []));

// ── progreso: cuenta cabezas, sin pesos ─────────────────────────────────────
const pasos = [{
  skey: 'p1', bkey: 'b1', preguntas: [
    { qkey: 'a', tipo: 'corta', requerida: true, pantalla: 0 },
    { qkey: 'b', tipo: 'corta', requerida: true, pantalla: 0 },
    { qkey: 'c', tipo: 'abierta', largo: 100, requerida: true, pantalla: 1 },
    { qkey: 'd', tipo: 'corta', requerida: false, pantalla: 1 },
    { qkey: 'e', tipo: 'corta', requerida: true, pantalla: 1,
      visibleSi: { qkey: 'a', in: ['si'] } },
  ],
}];
let r = calcularProgreso(pasos, {}, []);
ok('4 obligatorias, la condicional oculta', r.requeridas === 3 && r.pct === 0);

r = calcularProgreso(pasos, { a: { valor: 'Si', valorJson: { valor: 'si' } } }, []);
ok('al responder la condicion aparece la 4ta', r.requeridas === 4 && r.respondidas === 1);
ok('1 de 4 es 25%', r.pct === 25);

// ── pantallas: agrupamiento explicito ───────────────────────────────────────
const pant = pantallasDe(pasos[0], {});
ok('dos pantallas', pant.length === 2);
ok('la primera tiene 2 preguntas', pant[0].preguntas.length === 2);
ok('la ruta es el qkey de la primera', pant[0].id === 'a');
ok('la segunda excluye la condicional oculta', pant[1].preguntas.length === 2);

// ── lista lineal ────────────────────────────────────────────────────────────
const lista = nodos(pasos, {});
ok('portada + 2 pantallas', lista.length === 3 && lista[0].tipo === 'portada');

// ── medidor: habla en caracteres ────────────────────────────────────────────
ok('vacio pide el minimo', medidor(0, 900).texto === 'Mínimo 540 caracteres');
ok('a mitad de camino dice cuanto falta', medidor(300, 900).texto === 'Faltan 240 caracteres');
ok('pasado el minimo felicita', medidor(600, 900).texto === 'Muy buena respuesta');
ok('completo dice excelente', medidor(900, 900).texto === 'Excelente');

// ── stats de paso: info y resumen no cuentan ────────────────────────────────
const conInfo = { skey: 'p', preguntas: [
  { qkey: 'i', tipo: 'info', requerida: false, pantalla: 0 },
  { qkey: 'x', tipo: 'corta', requerida: true, pantalla: 0 },
] };
ok('la tarjeta informativa no cuenta', statsPaso(conInfo, {}, []).total === 1);

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLAS`);
process.exit(fallos === 0 ? 0 : 1);

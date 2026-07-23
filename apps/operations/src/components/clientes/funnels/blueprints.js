// Estructuras de landing pre-armadas ("Blueprints") para insertar en el DEL.
//
// Son TABLAS (la base para armar la página) con la MISMA jerarquía visual del
// Google Doc de referencia: títulos grandes (H2/H3), placeholders resaltados en
// amarillo (lo que hay que reemplazar: FOTO…, [VSL], X minutos…), notas de diseño
// en azul y disclaimers en gris chico. Grilla de 2 columnas: una fila puede ocupar
// el ancho completo (colspan=2) o partirse en 2 (o 3) columnas.
//
// El editor del DEL solo permite tablas + estilos inline (el sanitizador borra
// `class`; ver delSanitize.js). Cada tabla setea `display:table` inline porque
// `.del-rich table` fuerza `display:block`; los tamaños/colores van inline para
// verse IGUAL editando y leyendo (los <h2>/<h3> llevan font-size inline que pisa
// las reglas .del-rich).

// ── Estilos de texto (espejo del doc: 18pt→24px, 14-15pt→19-20px, 13pt→16px…) ──
const bigTitle = (t) => `<h2 style="font-size:24px;font-weight:700;color:#111827;line-height:1.2;margin:2px 0 4px">${t}</h2>`;
const secTitle = (t, px = 19) => `<h3 style="font-size:${px}px;font-weight:700;color:#111827;line-height:1.25;margin:8px 0 4px">${t}</h3>`;
const kicker = (t) => `<p style="font-size:16px;font-weight:700;color:#111827;margin:0 0 2px">${t}</p>`;
const lead = (t) => `<p style="font-size:14px;font-weight:700;color:#1F2430;margin:8px 0 0;line-height:1.55">${t}</p>`;
const field = (t) => `<p style="font-size:14px;font-weight:600;color:#4B5563;margin:2px 0">${t}</p>`;
const cta = (t) => `<p style="font-size:14px;font-weight:700;color:#111827;margin:10px 0 0">${t}</p>`;
const note = (t) => `<p style="font-size:12px;color:#6B7280;margin:2px 0 0">${t}</p>`;
const body = (t) => `<p style="font-size:14px;color:#1F2430;margin:6px 0 0;line-height:1.6">${t}</p>`;
// Placeholder a reemplazar: marcador amarillo simple (mismo formato que produce la
// herramienta "Marcador" de la barra, para poder quitarlo con "Sin marcador").
const hi = (t) => `<span style="background-color:#FFF176">${t}</span>`;
// Nota de diseño (azul, como en el doc).
const blue = (t) => `<span style="color:#1A56DB">${t}</span>`;

// ── Grilla ────────────────────────────────────────────────────────────────────
const CS = 'border:1px solid #CDD3DD;padding:14px 16px;vertical-align:top';
const td = (inner, { span = 1, align = 'left' } = {}) =>
  `<td${span > 1 ? ` colspan="${span}"` : ''} style="${CS};text-align:${align}">${inner}</td>`;
const tr = (...cells) => `<tr>${cells.join('')}</tr>`;
const table = (...rows) =>
  `<table style="display:table;table-layout:fixed;width:100%;border-collapse:collapse;margin:12px 0">${rows.join('')}</table><p></p>`;

// ── Blueprint 1: Pre-landing (captura de datos) ───────────────────────────────
const preLanding = table(
  tr(td(kicker('[LOGO CLIENTE]'), { span: 2, align: 'center' })),
  tr(
    td(
      kicker('¡ATENCIÓN + AVATAR!') +
      bigTitle('TITULO') +
      bigTitle('SUBTITULO') +
      lead('Completa tus datos y haz clic para desbloquear el video gratuito') +
      field('NOMBRE') + field('MAIL') + field('TELEFONO') +
      cta('BOTON CTA: QUIERO DESBLOQUEAR EL VIDEO')
    ),
    td(hi('FOTO DEL CLIENTE PROFESIONAL, EQUIPO')),
  ),
  tr(td(
    secTitle(`En solo ${hi('X minutos')} vas a descubrir…`) +
    note(blue('(diseño: poner los bullets en cards)')) +
    cta('BOTON CTA: QUIERO DESBLOQUEAR EL VIDEO') +
    field('DISPONIBLE POR TIEMPO LIMITADO'),
    { span: 2 })),
);

// ── Blueprint 2: Landing (video desbloqueado / VSL) ───────────────────────────
const landing = table(
  tr(td(secTitle('🔓 VIDEO DESBLOQUEADO', 17), { span: 2, align: 'center' })),
  tr(td(
    secTitle('TITULAR CORTO QUE IMPULSE CLIC EN VIDEO') +
    body(hi('[VSL]')) +
    cta('[BOTÓN CTA: QUIERO + PROMESA (DESEO)]') +
    note('Sin compromiso. Primero veremos juntos si esto es para ti'),
    { span: 2, align: 'center' })),
  tr(td(lead('AUTORIDAD EN HIGHLIGHTS (3-4 tarjetas)'), { span: 2, align: 'center' })),
  tr(td(secTitle('CASOS DE ÉXITO (2 en video)'), { span: 2, align: 'center' })),
  tr(td(
    secTitle('Esto es para ti si…', 20) +
    body('✅ …<br>✅ …<br>✅ …') +
    cta('[BOTÓN CTA: QUIERO + PROMESA (DESEO)]') +
    note('Sin compromiso. Primero veremos juntos si esto es para ti'),
    { span: 2, align: 'center' })),
  tr(
    td(lead('AUTORIDAD CORTA CON BULLETS') + secTitle('Sobre tu mentora — “Soy …”', 20)),
    td(hi('FOTO CLIENTA'), { align: 'center' }),
  ),
  tr(td(
    cta('[BOTÓN CTA: QUIERO + PROMESA (DESEO)]') +
    note('Sin compromiso. Primero veremos juntos si esto es para ti'),
    { span: 2, align: 'center' })),
);

export const BLUEPRINTS = [
  { id: 'prelanding', label: 'Pre-landing', descripcion: 'Captura de datos: logo, hero (copy + foto), bullets y CTA', html: preLanding },
  { id: 'landing', label: 'Landing (VSL)', descripcion: 'Video desbloqueado: VSL, autoridad, casos, calificación y CTA', html: landing },
];

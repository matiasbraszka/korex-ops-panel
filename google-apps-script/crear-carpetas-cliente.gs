/**
 * Korex — Creación automática de carpetas de cliente en Google Drive.
 * (facturas + árbol + lectura de texto + escritura del brief + carpetas por avatar + mover/archivar)
 *
 * --- ACTUALIZAR (mantiene la MISMA URL) ---
 * Pegar este código, luego: Implementar → Administrar implementaciones →
 * ✏️ editar → Versión: "Nueva versión" → Implementar.
 */

const SHARED_SECRET    = 'korex-drive-2026';
const PARENT_FOLDER_ID = '1aCLCSKHbtOSBhk-2pyKMT4SxmIodJfe3';        // "Clientes NUEVOS"
const TEMPLATE_DOC_ID  = '19wgaW_MbN7aT0NA2sAcI6slad2r9t-2UeuUB2nDGetw'; // template Onboarding
const DEL_TEMPLATE_DOC_ID = '1n_1UOGy5pu8Hnkhh0L-Z0I64IS4r_hPk1D2TCp8ryWI'; // template "DEL"

const FAC_FOLDER_ID = '1UVq5LhPr6s-6xnJ1PElXktSOKNI-pqPl';
const FAC_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const DEFAULT_STRATEGY_FOLDER = 'Estrategia #1 | [A DEFINIR] | {FECHA}';
const DEFAULT_DOC_TITLE       = 'Onboarding Korex y {LABEL}';
const DEFAULT_DEL_DOC_TITLE   = 'DEL {LABEL}, para {ESTRATEGIA}';
const DEFAULT_ESTRATEGIA      = 'A DEFINIR';
const DEFAULT_SUBFOLDERS = [
  '1. Anuncios (Audiovisual)', '2. Estrategia', '3. Recursos',
  '4. VSL (Audiovisual)', '5. Mural de Instagram', '6. Auditoria', '7. Otros',
];
const DEFAULT_NESTED = {
  '1. Anuncios (Audiovisual)': ['Grabaciones', 'Terminados'],
  '4. VSL (Audiovisual)': ['Grabaciones', 'Terminados'],
  '3. Recursos': ['Branding', 'Fotos y Videos', 'Información de la empresa', 'Testimonios'],
};
const DOC_SUBFOLDER      = '2. Estrategia';
const RECURSOS_SUBFOLDER = '3. Recursos';

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.secret !== SHARED_SECRET) return json({ ok: false, error: 'unauthorized' });

    if (b.action === 'guardar_factura') return facGuardarFactura(b);
    if (b.action === 'listar_facturas') return facListarFacturas(b);

    // Lectura del árbol de una carpeta (para el panel: espejo de Drive del cliente).
    if (b.action === 'list_folder_tree') return listFolderTree(b);

    // Reordenar estrategias/carpetas desde el panel (el cerebro mueve docs entre estrategias).
    if (b.action === 'move_node') return moveNode(b);                    // mueve un archivo/carpeta a otra carpeta
    if (b.action === 'trash_node') return trashNode(b);                  // manda a la papelera un archivo/carpeta
    if (b.action === 'rename_node') return renameNode(b);                // renombra un archivo/carpeta (ej. tipo de estrategia)

    if (b.action === 'read_doc') return readDoc(b);                       // texto de un documento (todas las pestañas)
    if (b.action === 'read_doc_rich') return readDocRich(b);              // idem PERO con formato (títulos, negritas, colores, tablas, links)
    if (b.action === 'write_brief') return writeBrief(b);                 // crea/actualiza el brief del cliente
    if (b.action === 'ensure_avatar_folders') return ensureAvatarFolders(b); // subcarpetas por avatar en Anuncios
    if (b.action === 'get_drive_token') return driveToken(b);            // permiso temporal de lectura del Drive (para migrar recursos a Bunny/Supabase)

    const name = String(b.name || '').trim();
    if (!name) return json({ ok: false, error: 'missing_name' });
    const empresa = String(b.empresa || '').trim();
    const fecha   = String(b.fecha || '').trim();
    const label   = empresa ? (name + ' | ' + empresa) : name;

    var emails = Array.isArray(b.emails) ? b.emails : [];
    if (!emails.length && b.email) emails = [b.email];
    emails = emails.map(function (x) { return String(x || '').trim(); }).filter(Boolean);

    var st = b.structure || {};
    var subfolders = (Array.isArray(st.subfolders) && st.subfolders.length) ? st.subfolders : DEFAULT_SUBFOLDERS;
    var nested = (st.nested && typeof st.nested === 'object') ? st.nested : DEFAULT_NESTED;
    var strategyTpl = st.strategy_folder || DEFAULT_STRATEGY_FOLDER;
    var docTitleTpl = st.doc_title || DEFAULT_DOC_TITLE;
    var delTitleTpl = st.del_doc_title || DEFAULT_DEL_DOC_TITLE;
    var estrategia  = st.estrategia || DEFAULT_ESTRATEGIA;

    var parent = DriveApp.getFolderById(PARENT_FOLDER_ID);
    var clientFolder = parent.createFolder(label);
    var strategyName = strategyTpl.replace('{FECHA}', fecha);
    var estrategia = clientFolder.createFolder(strategyName);

    var sub = {};
    subfolders.forEach(function (n) {
      var folder = estrategia.createFolder(n);
      sub[n] = folder;
      if (nested[n]) nested[n].forEach(function (child) { folder.createFolder(child); });
    });

    var docParent = sub[DOC_SUBFOLDER] || sub[subfolders[0]] || estrategia;
    var copy = DriveApp.getFileById(TEMPLATE_DOC_ID).makeCopy(docTitleTpl.replace('{LABEL}', label), docParent);
    var doc = DocumentApp.openById(copy.getId());
    var docBody = doc.getBody();
    docBody.replaceText('\\[NOMBRE DEL CLIENTE\\]', label);
    var recursos = sub[RECURSOS_SUBFOLDER];
    var recursosUrl = recursos ? recursos.getUrl() : clientFolder.getUrl();
    docBody.replaceText('\\[ADJUNTAR CARPETA DEL CLIENTE\\]', recursosUrl);
    doc.saveAndClose();

    var delTitle = delTitleTpl.replace('{LABEL}', label).replace('{ESTRATEGIA}', estrategia);
    var delCopy = DriveApp.getFileById(DEL_TEMPLATE_DOC_ID).makeCopy(delTitle, docParent);
    var delDoc = DocumentApp.openById(delCopy.getId());
    var delBody = delDoc.getBody();
    delBody.replaceText('\\[CLIENTE\\]', label);
    delBody.replaceText('\\[ESTRATEGIA\\]', estrategia);
    delDoc.saveAndClose();

    emails.forEach(function (em) {
      try { clientFolder.addEditor(em); } catch (err) {}
      try { copy.addEditor(em); } catch (err) {}
      try { delCopy.addEditor(em); } catch (err) {}
    });

    var subUrls = {};
    subfolders.forEach(function (n) { if (sub[n]) subUrls[n] = sub[n].getUrl(); });

    return json({
      ok: true,
      folderUrl: clientFolder.getUrl(),
      recursosUrl: recursosUrl,
      docUrl: copy.getUrl(),
      delDocUrl: delCopy.getUrl(),
      strategyName: strategyName,
      subfolders: subUrls,
    });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- Facturas ----------
function facGuardarFactura(b) {
  try {
    var html = String(b.html || '');
    if (!html) return json({ ok: false, error: 'missing_html' });
    var numero = parseInt(String(b.numero || '').replace(/[^0-9]/g, ''), 10) || 0;
    var nombre = String(b.nombreFactura || '').trim() || 'Cliente';
    var fecha = b.fecha ? new Date(b.fecha) : new Date();
    if (isNaN(fecha.getTime())) fecha = new Date();

    var carpeta = facCarpetaMes(fecha);
    var limpio = nombre.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    var pdf = Utilities.newBlob(html, 'text/html', 'factura.html')
      .getAs('application/pdf')
      .setName((numero || '') + ' ' + limpio + '.pdf');
    var file = carpeta.createFile(pdf);
    return json({ ok: true, url: file.getUrl(), carpeta: carpeta.getName(), pdf_base64: Utilities.base64Encode(pdf.getBytes()) });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function facListarFacturas(b) {
  try {
    var raiz = DriveApp.getFolderById(FAC_FOLDER_ID);
    var out = [];
    function push(f, mes) {
      var title = f.getName();
      var base = title.replace(/\.pdf$/i, '');
      var m = base.match(/^\s*(\d+)\s+([\s\S]*)$/);
      out.push({ number: m ? m[1] : '', name: m ? m[2].trim() : base.trim(), month: mes || '', file: title, url: f.getUrl() });
    }
    var rf = raiz.getFiles();
    while (rf.hasNext()) push(rf.next(), '');
    var fs = raiz.getFolders();
    while (fs.hasNext()) {
      var mf = fs.next();
      var mes = mf.getName();
      var files = mf.getFiles();
      while (files.hasNext()) push(files.next(), mes);
    }
    return json({ ok: true, count: out.length, facturas: out });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function facCarpetaMes(date) {
  var nombre = FAC_MESES[date.getMonth()] + ' ' + date.getFullYear();
  var raiz = DriveApp.getFolderById(FAC_FOLDER_ID);
  var it = raiz.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : raiz.createFolder(nombre);
}

// ---------- Lectura del árbol (acción 'list_folder_tree') ----------
function listFolderTree(b) {
  var rootId = String(b.folderId || '').trim();
  if (!rootId) return json({ ok: false, error: 'missing_folderId' });
  var maxNodes = Number(b.maxNodes) || 3000;
  var FOLDER_MIME = 'application/vnd.google-apps.folder';

  var root;
  try { root = DriveApp.getFolderById(rootId); }
  catch (err) { return json({ ok: false, error: 'folder_not_found' }); }

  var nodes = [];
  var truncated = false;

  nodes.push({ id: root.getId(), name: root.getName(), parentId: null, mimeType: FOLDER_MIME, url: root.getUrl(), modified: dateIso(root.getLastUpdated()), depth: 0, isRoot: true });

  var queue = [{ folder: root, depth: 0 }];
  while (queue.length) {
    var cur = queue.shift();
    var parentId = cur.folder.getId();

    var subs = cur.folder.getFolders();
    while (subs.hasNext()) {
      if (nodes.length >= maxNodes) { truncated = true; break; }
      var f = subs.next();
      nodes.push({ id: f.getId(), name: f.getName(), parentId: parentId, mimeType: FOLDER_MIME, url: f.getUrl(), modified: dateIso(f.getLastUpdated()), depth: cur.depth + 1, isRoot: false });
      queue.push({ folder: f, depth: cur.depth + 1 });
    }
    if (truncated) break;

    var files = cur.folder.getFiles();
    while (files.hasNext()) {
      if (nodes.length >= maxNodes) { truncated = true; break; }
      var file = files.next();
      var fsize = null; try { fsize = file.getSize(); } catch (e) { fsize = null; } // peso en bytes (para planificar la migración de Recursos)
      nodes.push({ id: file.getId(), name: file.getName(), parentId: parentId, mimeType: file.getMimeType(), url: file.getUrl(), modified: dateIso(file.getLastUpdated()), depth: cur.depth + 1, isRoot: false, size: fsize });
    }
    if (truncated) break;
  }

  return json({ ok: true, nodes: nodes, count: nodes.length, truncated: truncated });
}

// ---------- Reordenar Drive (acciones 'move_node' / 'trash_node') ----------
// El cerebro de marketing las usa para consolidar/separar estrategias (que son un
// espejo de las carpetas "Estrategia #N" del Drive del cliente). Después de mover,
// el panel corre drive-sync para reflejar el cambio.

// Devuelve el File o la Folder por id (probando ambos), o lanza si no existe.
function driveNodeById(id) {
  try { return DriveApp.getFileById(id); }
  catch (e1) {
    try { return DriveApp.getFolderById(id); }
    catch (e2) { throw new Error('node_not_found'); }
  }
}

// Mueve un archivo o carpeta a otra carpeta destino. { nodeId, targetFolderId }
function moveNode(b) {
  var nodeId = String(b.nodeId || '').trim();
  var targetId = String(b.targetFolderId || '').trim();
  if (!nodeId || !targetId) return json({ ok: false, error: 'missing_params' });
  var target;
  try { target = DriveApp.getFolderById(targetId); }
  catch (e) { return json({ ok: false, error: 'target_not_found' }); }
  var item;
  try { item = driveNodeById(nodeId); }
  catch (e) { return json({ ok: false, error: 'node_not_found' }); }
  item.moveTo(target); // lo saca de TODOS los padres actuales y lo deja solo en la carpeta destino
  return json({ ok: true, moved: nodeId, to: targetId, name: item.getName() });
}

// Manda a la papelera un archivo o carpeta (ej. una carpeta de estrategia que quedó vacía).
// Permiso temporal de lectura del Drive (OAuth token, ~1h) para migrar los recursos:
// el motor de migración lo usa del lado servidor para que Bunny/Supabase bajen cada
// archivo directo de la API de Drive (files.get?alt=media), sin importar el tamaño y sin
// hacer públicos los archivos. Protegido por el SHARED_SECRET (ya validado en doPost).
function driveToken() {
  return json({ ok: true, token: ScriptApp.getOAuthToken() });
}

// No borra definitivo (queda recuperable en la papelera). { nodeId }
function trashNode(b) {
  var nodeId = String(b.nodeId || '').trim();
  if (!nodeId) return json({ ok: false, error: 'missing_params' });
  var item;
  try { item = driveNodeById(nodeId); }
  catch (e) { return json({ ok: false, error: 'node_not_found' }); }
  var name = item.getName();
  item.setTrashed(true); // a la papelera (recuperable), no borrado definitivo
  return json({ ok: true, trashed: nodeId, name: name });
}

// Renombra un archivo o carpeta (ej. corregir el TIPO de una estrategia en el nombre de la
// carpeta "Estrategia #N | Producto | fecha", que es de donde el panel lee el tipo). { nodeId, newName }
function renameNode(b) {
  var nodeId = String(b.nodeId || '').trim();
  var newName = String(b.newName || '').trim();
  if (!nodeId || !newName) return json({ ok: false, error: 'missing_params' });
  var item;
  try { item = driveNodeById(nodeId); }
  catch (e) { return json({ ok: false, error: 'node_not_found' }); }
  var old = item.getName();
  item.setName(newName);
  return json({ ok: true, renamed: nodeId, from: old, to: newName });
}

// ---------- Lectura del TEXTO de un documento (acción 'read_doc') ----------
// Lee TODAS las pestañas del Doc (Analisis, Avatares, Ads avatar N, VSL Avatar N, ...),
// incluidas las anidadas. Antes solo leía la primera pestaña y se perdía todo lo demás.
function readDoc(b) {
  var docId = String(b.docId || '').trim();
  if (!docId) return json({ ok: false, error: 'missing_docId' });
  var mime = String(b.mimeType || '');
  try {
    var title = '';
    var text = '';
    if (mime === 'application/vnd.google-apps.document') {
      var doc = DocumentApp.openById(docId);
      title = doc.getName();
      var tabs = doc.getTabs ? doc.getTabs() : null;
      if (tabs && tabs.length) {
        var parts = [];
        var readTab = function (tab) {
          try {
            var dt = tab.asDocumentTab();
            var tabTitle = tab.getTitle ? tab.getTitle() : '';
            var body = dt.getBody().getText();
            if (body && body.replace(/\s/g, '') !== '') {
              parts.push((tabTitle ? ('===== ' + tabTitle + ' =====\n') : '') + body);
            }
          } catch (err) {}
          var kids = tab.getChildTabs ? tab.getChildTabs() : [];
          for (var i = 0; i < kids.length; i++) readTab(kids[i]);
        };
        for (var t = 0; t < tabs.length; t++) readTab(tabs[t]);
        text = parts.join('\n\n');
      } else {
        text = doc.getBody().getText();
      }
    } else {
      var file = DriveApp.getFileById(docId);
      title = file.getName();
      text = file.getBlob().getDataAsString('UTF-8');
    }
    if (text.length > 400000) text = text.slice(0, 400000);
    return json({ ok: true, text: text, title: title });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- Lectura CON FORMATO de un documento (acción 'read_doc_rich') ----------
//
// read_doc usa dt.getBody().getText(), que devuelve TEXTO PELADO: los títulos, las
// negritas, los colores, las tablas y los links se pierden ahí, antes de que nada
// llegue al panel. Un título como "CONCLUSIONES DE LA ESTRATEGIA" llegaba como
// texto en mayúsculas — las mayúsculas eran lo único que sobrevivía del énfasis.
//
// Esta función recorre las MISMAS pestañas que read_doc (mismo walk, incluidas las
// anidadas: es el que arregló el bug de "solo leía la primera pestaña") pero
// serializa la estructura en vez del texto.
//
// ES UNA ACCIÓN NUEVA, NO REEMPLAZA A read_doc. No se toca read_doc a propósito:
// de su formato "===== Título =====" comen parseDelTabs, resolverVsl, LANDING_RE y
// el copy de páginas. Cambiarlo rompería todo eso de una.
//
// Devuelve: { ok, title, tabs: [{ title, html }] }
//
// LO QUE NO TRAE (a conciencia):
//   · Las imágenes. Un Doc las guarda adentro suyo; para mostrarlas en el panel hay
//     que bajarlas y alojarlas nosotros, y eso es la Etapa C (Recursos). Por ahora
//     deja una marca <figure data-drive-image> en su lugar, para que se vea que ahí
//     va una imagen y no parezca que el documento está incompleto.
//
// TABLAS: las landings, pre-landings, PCL y formularios venían armadas DENTRO de tablas
// en el Doc, y antes rtTable() sacaba solo el getText() de cada celda: se conservaba la
// grilla pero se aplanaba TODO el formato de adentro (negritas, títulos, colores). Ahora
// la tabla se DESARMA: el contenido de cada celda pasa por el mismo serializador que el
// resto del documento (rtBlocks) y se vuelca como bloques normales, sin grilla. Así esas
// secciones quedan con el mismo formato que el resto del DEL.

function rtEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Un link de un Doc puede ser cualquier cosa, incluido "javascript:...". Escapar el
// texto no alcanza: el navegador ejecutaría igual el href. Solo pasan http, https y
// mailto; el resto se cae y queda el texto sin link.
function rtHref(u) {
  var s = String(u || '').trim();
  if (!/^(https?:|mailto:)/i.test(s)) return null;
  return s;
}

// Un color de Google viene como "#rrggbb". Si viene otra cosa, no se pone: iría
// crudo adentro de un style="".
function rtColor(c) {
  var s = String(c || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : null;
}

// Un "run" es un tramo con el mismo formato. Google los marca con índices de corte.
function rtRun(t, from, to) {
  var raw = t.getText().substring(from, to);
  if (!raw) return '';
  var html = rtEsc(raw);
  var bold = false, ital = false, und = false, color = null, link = null;
  try { bold = t.isBold(from); } catch (e) {}
  try { ital = t.isItalic(from); } catch (e) {}
  try { und = t.isUnderline(from); } catch (e) {}
  try { color = rtColor(t.getForegroundColor(from)); } catch (e) {}
  try { link = rtHref(t.getLinkUrl(from)); } catch (e) {}

  if (bold) html = '<strong>' + html + '</strong>';
  if (ital) html = '<em>' + html + '</em>';
  // El subrayado de un link lo pone el link: no hace falta doblarlo.
  if (und && !link) html = '<u>' + html + '</u>';
  // El negro por defecto no se marca: ensuciaría el html con un color en cada run.
  if (color && color !== '#000000') html = '<span style="color:' + color + '">' + html + '</span>';
  if (link) html = '<a href="' + rtEsc(link) + '" target="_blank" rel="noreferrer">' + html + '</a>';
  return html;
}

function rtText(el) {
  var t;
  try { t = el.editAsText(); } catch (e) { return rtEsc(el.getText ? el.getText() : ''); }
  var s = t.getText();
  if (!s) return '';
  var idx;
  try { idx = t.getTextAttributeIndices(); } catch (e) { idx = []; }
  if (!idx.length || idx[0] !== 0) idx = [0].concat(idx || []);
  var out = [];
  for (var i = 0; i < idx.length; i++) {
    var to = (i + 1 < idx.length) ? idx[i + 1] : s.length;
    if (to > idx[i]) out.push(rtRun(t, idx[i], to));
  }
  return out.join('');
}

// El nivel de título del párrafo: es lo que hace que el documento se lea de un vistazo.
function rtTag(p) {
  var h;
  try { h = p.getHeading(); } catch (e) { return 'p'; }
  var PH = DocumentApp.ParagraphHeading;
  if (h === PH.TITLE || h === PH.HEADING1) return 'h1';
  if (h === PH.SUBTITLE || h === PH.HEADING2) return 'h2';
  if (h === PH.HEADING3) return 'h3';
  if (h === PH.HEADING4) return 'h4';
  if (h === PH.HEADING5) return 'h5';
  if (h === PH.HEADING6) return 'h6';
  return 'p';
}

// Una tabla del Doc NO se serializa como <table>: se DESARMA. El contenido de cada
// celda pasa por rtBlocks() (el mismo serializador que el cuerpo de la pestaña), así que
// conserva negritas, títulos, colores, links y listas, y se vuelca como bloques normales
// en orden de lectura (fila por fila, celda por celda). Motivo: las landings/formularios
// estaban maquetadas en tablas y esa grilla no se necesita en el panel — lo que importa
// es el formato de adentro, que antes se perdía con getText().
function rtTable(tb) {
  var out = [];
  for (var r = 0; r < tb.getNumRows(); r++) {
    var row = tb.getRow(r);
    for (var c = 0; c < row.getNumCells(); c++) {
      var blocks = rtBlocks(row.getCell(c));
      // Celda sin texto real (solo tags o espacios) = espaciado, no viaja.
      if (blocks.replace(/<[^>]*>/g, '').trim()) out.push(blocks);
    }
  }
  return out.join('\n');
}

// Serializa los bloques hijos de un contenedor. Sirve tanto para el cuerpo de una
// pestaña (Body) como para una celda de tabla (TableCell): las dos exponen la misma API
// getNumChildren()/getChild(i) con párrafos, listas y tablas anidadas. Los ítems de lista
// consecutivos se agrupan en una sola <ul>/<ol>: en el Doc cada ítem es un elemento
// suelto, y sin agrupar quedarían N listas de un ítem cada una.
function rtBlocks(container) {
  var ET = DocumentApp.ElementType;
  var out = [], lista = null;
  var cerrarLista = function () { if (lista) { out.push('</' + lista + '>'); lista = null; } };

  for (var i = 0; i < container.getNumChildren(); i++) {
    var el = container.getChild(i), tipo;
    try { tipo = el.getType(); } catch (e) { continue; }

    if (tipo === ET.LIST_ITEM) {
      var li = el.asListItem(), orden = 'ul';
      try {
        var g = li.getGlyphType(), GT = DocumentApp.GlyphType;
        if (g === GT.NUMBER || g === GT.LATIN_LOWER || g === GT.LATIN_UPPER || g === GT.ROMAN_LOWER || g === GT.ROMAN_UPPER) orden = 'ol';
      } catch (e) {}
      if (lista && lista !== orden) cerrarLista();
      if (!lista) { out.push('<' + orden + '>'); lista = orden; }
      out.push('<li>' + rtText(li) + '</li>');
      continue;
    }
    cerrarLista();

    if (tipo === ET.PARAGRAPH) {
      var p = el.asParagraph();
      // Una imagen suelta viene envuelta en un párrafo vacío.
      var img = '';
      try {
        for (var k = 0; k < p.getNumChildren(); k++) {
          if (p.getChild(k).getType() === ET.INLINE_IMAGE) {
            img += '<figure data-drive-image="1">[imagen del documento]</figure>';
          }
        }
      } catch (e) {}
      var inner = rtText(p);
      if (img) { out.push(img); if (inner.replace(/<[^>]*>/g, '').trim()) out.push('<p>' + inner + '</p>'); continue; }
      // Los párrafos vacíos del Doc son espaciado, no contenido: no viajan.
      if (!inner.replace(/<[^>]*>/g, '').trim()) continue;
      var tag = rtTag(p);
      out.push('<' + tag + '>' + inner + '</' + tag + '>');
      continue;
    }

    if (tipo === ET.TABLE) { out.push(rtTable(el.asTable())); continue; }
    if (tipo === ET.INLINE_IMAGE) { out.push('<figure data-drive-image="1">[imagen del documento]</figure>'); continue; }
  }
  cerrarLista();
  return out.join('\n');
}

// Cuerpo de una pestaña. Es rtBlocks() sobre el Body; existe aparte para dejar claro el
// punto de entrada que usa readDocRich.
function rtBody(body) {
  return rtBlocks(body);
}

function readDocRich(b) {
  var docId = String(b.docId || '').trim();
  if (!docId) return json({ ok: false, error: 'missing_docId' });
  var mime = String(b.mimeType || '');
  if (mime !== 'application/vnd.google-apps.document') {
    return json({ ok: false, error: 'not_a_google_doc' });
  }
  try {
    var doc = DocumentApp.openById(docId);
    var tabs = doc.getTabs ? doc.getTabs() : null;
    var res = [];

    var leerTab = function (tab) {
      try {
        var dt = tab.asDocumentTab();
        var html = rtBody(dt.getBody());
        if (html && html.replace(/<[^>]*>/g, '').replace(/\s/g, '') !== '') {
          res.push({ title: (tab.getTitle ? tab.getTitle() : ''), html: html });
        }
      } catch (err) {}
      var kids = tab.getChildTabs ? tab.getChildTabs() : [];
      for (var i = 0; i < kids.length; i++) leerTab(kids[i]);
    };

    if (tabs && tabs.length) {
      for (var t = 0; t < tabs.length; t++) leerTab(tabs[t]);
    } else {
      // Doc viejo, sin pestañas.
      res.push({ title: '', html: rtBody(doc.getBody()) });
    }

    // Tope de seguridad: el html pesa ~2,5x el texto. El DEL más grande son 138.658
    // caracteres de texto, así que el tope no debería tocarse nunca — está para que
    // un Doc raro no tire la función.
    var total = 0;
    for (var r = 0; r < res.length; r++) total += res[r].html.length;
    if (total > 900000) return json({ ok: false, error: 'doc_demasiado_grande', chars: total });

    return json({ ok: true, title: doc.getName(), tabs: res });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- Escritura del brief del cliente (acción 'write_brief') ----------
// Si viene docId, actualiza ese Doc; si no, crea "Brief - <cliente>" en la carpeta del cliente.
function writeBrief(b) {
  try {
    var docId = String(b.docId || '').trim();
    var content = String(b.content || '');
    var title = String(b.title || 'Brief').trim();
    var doc;
    if (docId) {
      doc = DocumentApp.openById(docId);
    } else {
      var created = DocumentApp.create(title);
      docId = created.getId();
      var folderId = String(b.clientFolderId || '').trim();
      if (folderId) {
        try { DriveApp.getFileById(docId).moveTo(DriveApp.getFolderById(folderId)); } catch (e) {}
      }
      doc = DocumentApp.openById(docId);
    }
    var body = doc.getBody();
    body.clear();
    body.setText(content);
    doc.saveAndClose();
    var file = DriveApp.getFileById(docId);
    return json({ ok: true, docId: docId, url: file.getUrl(), title: doc.getName() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- Subcarpetas por avatar (acción 'ensure_avatar_folders') ----------
// Bajo la carpeta "Anuncios", asegura "Grabaciones" y "Ediciones" y crea una subcarpeta por
// avatar dentro de cada una. Reconoce nombres ya existentes (alias) para no duplicar carpetas.
function ensureAvatarFolders(b) {
  try {
    var anunciosId = String(b.anunciosFolderId || '').trim();
    if (!anunciosId) return json({ ok: false, error: 'missing_anunciosFolderId' });
    var names = Array.isArray(b.avatars) ? b.avatars : [];
    var anuncios = DriveApp.getFolderById(anunciosId);
    var grab = folderByAlias(anuncios, ['Grabaciones','Grabacion','Grabación','Grabaciónes'], 'Grabaciones');
    var edit = folderByAlias(anuncios, ['Ediciones','Edicion','Edición','Editados','Terminados'], 'Ediciones');
    var out = [];
    names.forEach(function (nm) {
      var n = String(nm || '').trim(); if (!n) return;
      var safe = n.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      var gf = folderByAlias(grab, [safe], safe);
      var ef = folderByAlias(edit, [safe], safe);
      out.push({
        name: n,
        grabaciones: { id: gf.getId(), url: gf.getUrl(), files: countFilesDeep(gf, 0) },
        ediciones:   { id: ef.getId(), url: ef.getUrl(), files: countFilesDeep(ef, 0) },
      });
    });
    return json({ ok: true, grabacionesUrl: grab.getUrl(), edicionesUrl: edit.getUrl(), avatars: out });
  } catch (err) { return json({ ok: false, error: String(err) }); }
}
function folderByAlias(parent, aliases, canonical) {
  for (var i = 0; i < aliases.length; i++) {
    var it = parent.getFoldersByName(aliases[i]);
    if (it.hasNext()) return it.next();
  }
  return parent.createFolder(canonical);
}
function countFilesDeep(folder, depth) {
  var c = 0; var f = folder.getFiles();
  while (f.hasNext()) { f.next(); c++; if (c > 200) return c; }
  if (depth < 3) { var subs = folder.getFolders(); while (subs.hasNext()) { c += countFilesDeep(subs.next(), depth + 1); if (c > 200) return c; } }
  return c;
}

function dateIso(d) {
  try { return d ? d.toISOString() : null; } catch (err) { return null; }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

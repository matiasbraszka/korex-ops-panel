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
    if (b.action === 'write_brief') return writeBrief(b);                 // crea/actualiza el brief del cliente
    if (b.action === 'ensure_avatar_folders') return ensureAvatarFolders(b); // subcarpetas por avatar en Anuncios

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
      nodes.push({ id: file.getId(), name: file.getName(), parentId: parentId, mimeType: file.getMimeType(), url: file.getUrl(), modified: dateIso(file.getLastUpdated()), depth: cur.depth + 1, isRoot: false });
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

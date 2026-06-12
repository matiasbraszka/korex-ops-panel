/**
 * Korex — Creación automática de carpetas de cliente en Google Drive.
 *
 * La llama la Edge Function `crear-venta` al completarse el formulario de venta.
 * Crea la carpeta del cliente en "Clientes NUEVOS", la subestructura de la
 * estrategia, duplica el onboarding (personalizado) y comparte carpeta + doc con
 * TODOS los emails de acceso del cliente como Editor.
 *
 * La estructura (subcarpetas, anidadas, nombre de carpeta de estrategia, título del
 * doc) y los emails llegan en el body desde la config del panel; si no llegan, usa
 * los DEFAULT_* de abajo (así nunca se rompe).
 *
 * Corre como la cuenta de Google que la despliega (acceso a "Clientes NUEVOS" y al template).
 *
 * --- ACTUALIZAR (mantiene la MISMA URL) ---
 * Pegar este código, luego: Implementar → Administrar implementaciones →
 * ✏️ editar → Versión: "Nueva versión" → Implementar.
 */

const SHARED_SECRET    = 'korex-drive-2026';
const PARENT_FOLDER_ID = '1aCLCSKHbtOSBhk-2pyKMT4SxmIodJfe3';        // "Clientes NUEVOS"
const TEMPLATE_DOC_ID  = '19wgaW_MbN7aT0NA2sAcI6slad2r9t-2UeuUB2nDGetw'; // template Onboarding
const DEL_TEMPLATE_DOC_ID = '1n_1UOGy5pu8Hnkhh0L-Z0I64IS4r_hPk1D2TCp8ryWI'; // template "DEL" (doc de trabajo)

// Defaults (fallback si la Edge Function no manda la estructura desde la config).
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
const DOC_SUBFOLDER      = '2. Estrategia';  // dónde se guarda el onboarding
const RECURSOS_SUBFOLDER = '3. Recursos';    // su link va dentro del onboarding

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.secret !== SHARED_SECRET) return json({ ok: false, error: 'unauthorized' });

    const name = String(b.name || '').trim();
    if (!name) return json({ ok: false, error: 'missing_name' });
    const empresa = String(b.empresa || '').trim();
    const fecha   = String(b.fecha || '').trim();
    const label   = empresa ? (name + ' | ' + empresa) : name;

    // Emails con acceso (array). Fallback al email único.
    var emails = Array.isArray(b.emails) ? b.emails : [];
    if (!emails.length && b.email) emails = [b.email];
    emails = emails.map(function (x) { return String(x || '').trim(); }).filter(Boolean);

    // Estructura desde la config; si no llega, defaults.
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

    // Onboarding dentro de "2. Estrategia" (o la 1ª subcarpeta si esa no existe).
    var docParent = sub[DOC_SUBFOLDER] || sub[subfolders[0]] || estrategia;
    var copy = DriveApp.getFileById(TEMPLATE_DOC_ID).makeCopy(docTitleTpl.replace('{LABEL}', label), docParent);
    var doc = DocumentApp.openById(copy.getId());
    var docBody = doc.getBody();
    docBody.replaceText('\\[NOMBRE DEL CLIENTE\\]', label);
    var recursos = sub[RECURSOS_SUBFOLDER];
    var recursosUrl = recursos ? recursos.getUrl() : clientFolder.getUrl();
    docBody.replaceText('\\[ADJUNTAR CARPETA DEL CLIENTE\\]', recursosUrl);
    doc.saveAndClose();

    // Documento de trabajo "DEL" (Documento En Limpio), también en "2. Estrategia".
    var delTitle = delTitleTpl.replace('{LABEL}', label).replace('{ESTRATEGIA}', estrategia);
    var delCopy = DriveApp.getFileById(DEL_TEMPLATE_DOC_ID).makeCopy(delTitle, docParent);
    var delDoc = DocumentApp.openById(delCopy.getId());
    var delBody = delDoc.getBody();
    delBody.replaceText('\\[CLIENTE\\]', label);
    delBody.replaceText('\\[ESTRATEGIA\\]', estrategia);
    delDoc.saveAndClose();

    // Compartir carpeta + onboarding + DEL con cada email como Editor.
    emails.forEach(function (em) {
      try { clientFolder.addEditor(em); } catch (err) {}
      try { copy.addEditor(em); } catch (err) {}
      try { delCopy.addEditor(em); } catch (err) {}
    });

    // Links de las subcarpetas principales (para crear la estrategia en el panel).
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

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

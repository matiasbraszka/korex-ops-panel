# Apps Script — acción `read_doc` (pendiente de Matías)

La edge function `client-brain-sync` pide el texto de un documento al **mismo Apps Script**
que ya usa `drive-sync` (el de `app_settings.venta_form_config.appscript_url`).
Hoy ese script maneja `action: "list_folder_tree"`; hay que agregarle el caso `read_doc`.

## Qué recibe
```json
{ "secret": "<appscript_secret>", "action": "read_doc", "docId": "<Drive file id>", "mimeType": "<mime>" }
```

## Qué debe devolver
```json
{ "ok": true, "text": "…cuerpo en texto plano…", "title": "…" }
```
o `{ "ok": false, "error": "…" }` si falla.

## Snippet a agregar en el `doPost` (junto al case de `list_folder_tree`)

```javascript
if (action === 'read_doc') {
  var docId = body.docId;
  var mime  = body.mimeType || '';
  try {
    var title = '';
    var text  = '';
    if (mime === 'application/vnd.google-apps.document') {
      // Google Doc nativo
      var doc = DocumentApp.openById(docId);
      title = doc.getName();
      text  = doc.getBody().getText();
    } else {
      // PDF u otros: exportar como texto plano vía Drive
      var file = DriveApp.getFileById(docId);
      title = file.getName();
      text  = file.getBlob().getDataAsString('UTF-8');
    }
    // Tope defensivo (evita respuestas gigantes)
    if (text.length > 200000) text = text.slice(0, 200000);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, text: text, title: title }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(e) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

## Requisitos del deploy (igual que onboarding/drive-sync)
- Ejecutar como **Yo** (la cuenta con acceso a los Drives de los clientes).
- Acceso: **Cualquier usuario**.
- Scopes: **Documents** + **Drive** (si el editor pide re-autorizar, aceptar).
- Re-deployar como **misma URL** (Administrar implementaciones → editar) para no cambiar
  `appscript_url`. Si cambia la URL, actualizar `app_settings.venta_form_config.appscript_url`.

Mientras esto no esté, `client-brain-sync` corre sin error pero devuelve `docs: 0`
(el Apps Script responde `ok:false` a `read_doc`).

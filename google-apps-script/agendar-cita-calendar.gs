/**
 * agendar-cita-calendar.gs — Crea/borra eventos en el Google Calendar de la
 * cuenta donde se deploya (admin@metodokorex.com).
 *
 * Lo llama la edge function `crear-cita` del panel Korex con:
 *   POST { secret, action: 'create_event', title, description, start, end }
 *   POST { secret, action: 'delete_event', eventId }
 *
 * SETUP (una vez, en admin@metodokorex.com):
 *   1. script.google.com → Nuevo proyecto → pegar este archivo.
 *   2. Implementar → Nueva implementación → "Aplicación web"
 *      - Ejecutar como: YO (admin@metodokorex.com)
 *      - Acceso: CUALQUIER PERSONA
 *   3. Copiar la URL del web app y guardarla en
 *      app_settings.soporte_config.calendar_script_url
 *      (el secret de abajo ya está en calendar_script_secret).
 */

var KXC_SECRET = 'kxc_EwXyjKalH8zizpq34syllP';

function kxcJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return kxcJson({ ok: false, error: 'busy' });
  }
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.secret !== KXC_SECRET) return kxcJson({ ok: false, error: 'unauthorized' });

    var action = String(b.action || '');
    var cal = CalendarApp.getDefaultCalendar();

    if (action === 'create_event') {
      var title = String(b.title || '').trim();
      var start = new Date(b.start);
      var end = new Date(b.end || b.start);
      if (!title || isNaN(start.getTime())) return kxcJson({ ok: false, error: 'bad_input' });
      if (isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 60 * 60000);

      var event = cal.createEvent(title, start, end, {
        description: String(b.description || ''),
      });
      // Link directo al evento en la UI de Google Calendar.
      var htmlLink = 'https://calendar.google.com/calendar/event?eid=' +
        Utilities.base64Encode(event.getId().replace('@google.com', '') + ' ' + cal.getId())
          .replace(/=+$/, '');
      return kxcJson({ ok: true, eventId: event.getId(), htmlLink: htmlLink });
    }

    if (action === 'delete_event') {
      var id = String(b.eventId || '');
      if (!id) return kxcJson({ ok: false, error: 'bad_input' });
      var ev = cal.getEventById(id);
      if (ev) ev.deleteEvent();
      return kxcJson({ ok: true });
    }

    return kxcJson({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return kxcJson({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

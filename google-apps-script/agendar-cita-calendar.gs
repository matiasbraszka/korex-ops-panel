/**
 * agendar-cita-calendar.gs — v2. Crea/mueve/borra eventos en el Google
 * Calendar de la cuenta donde se deploya (admin@metodokorex.com) y lee la
 * asistencia (RSVP) de los invitados.
 *
 * Lo llama la edge function `crear-cita` del panel Korex con:
 *   POST { secret, action: 'create_event', title, description, start, end, guests? }
 *   POST { secret, action: 'update_event', eventId, title?, start, end }
 *   POST { secret, action: 'delete_event', eventId }
 *   POST { secret, action: 'get_rsvp', eventId }
 *
 * SETUP (una vez, en admin@metodokorex.com):
 *   1. script.google.com → Nuevo proyecto → pegar este archivo.
 *   2. Implementar → Nueva implementación → "Aplicación web"
 *      - Ejecutar como: YO (admin@metodokorex.com)
 *      - Acceso: CUALQUIER PERSONA
 *   3. Copiar la URL del web app y guardarla en
 *      app_settings.soporte_config.calendar_script_url
 *      (el secret de abajo ya está en calendar_script_secret).
 *
 * ACTUALIZAR (si ya estaba deployado):
 *   script.google.com → abrir el proyecto → reemplazar el código por este →
 *   ejecutar una vez la función "autorizar" (▶) y aceptar los permisos →
 *   Implementar → Administrar implementaciones → ✏️ en la implementación
 *   activa → Versión: "Nueva versión" → Implementar. LA URL NO CAMBIA.
 */

var KXC_SECRET = 'kxc_EwXyjKalH8zizpq34syllP';

function kxcJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * EJECUTAR UNA VEZ a mano después de pegar este código (botón ▶ Ejecutar con
 * la función "autorizar" seleccionada): dispara el cartel de permisos nuevos
 * que necesita la limpieza del Meet automático.
 */
function autorizar() {
  CalendarApp.getDefaultCalendar().getName();
  UrlFetchApp.fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  Logger.log('Permisos OK');
}

// Google agrega un Google Meet automáticamente cuando el evento tiene
// invitados. La reunión es por Zoom, así que lo sacamos para que en la
// invitación quede UN solo link (el de Zoom, en la descripción).
function kxcRemoveMeet(eventId) {
  var id = String(eventId).replace('@google.com', '');
  var url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events/' +
    encodeURIComponent(id) + '?conferenceDataVersion=1';
  UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify({ conferenceData: null }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
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

      var opts = { description: String(b.description || '') };
      // guests: email(s) separados por coma → Google les manda la invitación
      // y pueden responder sí/no/quizás desde su propio calendario.
      if (b.guests) {
        opts.guests = String(b.guests);
        opts.sendInvites = true;
      }
      var event = cal.createEvent(title, start, end, opts);
      // Con invitados, Google mete un Meet automático: sacarlo (es por Zoom).
      if (b.guests) {
        try { kxcRemoveMeet(event.getId()); } catch (errMeet) {}
      }
      // Link directo al evento en la UI de Google Calendar.
      var htmlLink = 'https://calendar.google.com/calendar/event?eid=' +
        Utilities.base64Encode(event.getId().replace('@google.com', '') + ' ' + cal.getId())
          .replace(/=+$/, '');
      return kxcJson({ ok: true, eventId: event.getId(), htmlLink: htmlLink });
    }

    if (action === 'update_event') {
      var uid = String(b.eventId || '');
      var ustart = new Date(b.start);
      var uend = new Date(b.end || b.start);
      if (!uid || isNaN(ustart.getTime())) return kxcJson({ ok: false, error: 'bad_input' });
      if (isNaN(uend.getTime()) || uend <= ustart) uend = new Date(ustart.getTime() + 60 * 60000);
      var uev = cal.getEventById(uid);
      if (!uev) return kxcJson({ ok: false, error: 'not_found' });
      uev.setTime(ustart, uend);
      if (b.title) uev.setTitle(String(b.title));
      if (b.description !== undefined) uev.setDescription(String(b.description || ''));
      return kxcJson({ ok: true });
    }

    if (action === 'delete_event') {
      var id = String(b.eventId || '');
      if (!id) return kxcJson({ ok: false, error: 'bad_input' });
      var ev = cal.getEventById(id);
      if (ev) ev.deleteEvent();
      return kxcJson({ ok: true });
    }

    if (action === 'get_rsvp') {
      var rid = String(b.eventId || '');
      if (!rid) return kxcJson({ ok: false, error: 'bad_input' });
      var rev = cal.getEventById(rid);
      if (!rev) return kxcJson({ ok: false, error: 'not_found' });
      var guests = rev.getGuestList().map(function (g) {
        return { email: g.getEmail(), status: String(g.getGuestStatus()) }; // YES|NO|MAYBE|INVITED
      });
      return kxcJson({ ok: true, guests: guests });
    }

    return kxcJson({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return kxcJson({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

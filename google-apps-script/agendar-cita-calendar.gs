/**
 * agendar-cita-calendar.gs — v4. Crea/mueve/borra eventos en el Google
 * Calendar de la cuenta donde se deploya (admin@metodokorex.com), lee la
 * asistencia (RSVP), saca el Meet automático y da de alta contactos en
 * Google Contacts (para que aparezcan con nombre en el WhatsApp del celu).
 *
 * Lo llama el backend del panel Korex con:
 *   POST { secret, action: 'create_event', title, description, start, end, guests?, location? }
 *   POST { secret, action: 'update_event', eventId, title?, start, end }
 *   POST { secret, action: 'delete_event', eventId }
 *   POST { secret, action: 'get_rsvp', eventId }
 *   POST { secret, action: 'upsert_contact', name, phone }
 *
 * SETUP (una vez, en admin@metodokorex.com):
 *   1. script.google.com → Nuevo proyecto → pegar este archivo.
 *   2. En "Servicios" (+) agregar **People API** (identificador People).
 *   3. Implementar → Nueva implementación → "Aplicación web"
 *      - Ejecutar como: YO (admin@metodokorex.com)
 *      - Acceso: CUALQUIER PERSONA
 *   4. Copiar la URL del web app y guardarla en
 *      app_settings.soporte_config.calendar_script_url
 *      (el secret de abajo ya está en calendar_script_secret).
 *
 * ACTUALIZAR (si ya estaba deployado):
 *   script.google.com → abrir el proyecto → reemplazar el código por este →
 *   en "Servicios" (+) agregar **People API** si no está →
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
  // Dispara el permiso de Contactos (requiere el servicio People API agregado).
  try {
    People.People.searchContacts({ query: '', readMask: 'names' });
    Logger.log('Permisos OK (Calendar + Contactos)');
  } catch (e) {
    Logger.log('Falta agregar el servicio People API en "Servicios": ' + e);
  }
}

// Alta de contacto en Google Contacts (si no existe ya uno con ese teléfono).
// Así el WhatsApp del celular muestra el nombre en vez del número.
function kxcUpsertContact(name, phone) {
  var pretty = '+' + String(phone || '').replace(/\D/g, '');
  if (pretty.length < 8) return { ok: false, error: 'bad_phone' };
  // Warmup del índice de búsqueda (recomendación oficial de la People API).
  try { People.People.searchContacts({ query: '', readMask: 'names' }); } catch (e) {}
  var found = People.People.searchContacts({
    query: pretty.slice(-9),
    readMask: 'names,phoneNumbers',
  });
  if (found && found.results && found.results.length > 0) {
    return { ok: true, existed: true };
  }
  People.People.createContact({
    names: [{ givenName: String(name || pretty) }],
    phoneNumbers: [{ value: pretty }],
  });
  return { ok: true, created: true };
}

// Google agrega un Google Meet automáticamente cuando el evento tiene
// invitados. La reunión es por Zoom, así que lo sacamos para que en la
// invitación quede UN solo link (el de Zoom, en la descripción).
function kxcRemoveMeet(eventId) {
  var id = String(eventId).replace('@google.com', '');
  var url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events/' +
    encodeURIComponent(id) + '?conferenceDataVersion=1';
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify({ conferenceData: null }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  // 200 = Meet eliminado; si falla, devolver el detalle para diagnosticar.
  var code = res.getResponseCode();
  return code === 200 ? 200 : code + ':' + res.getContentText().slice(0, 200);
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

    // Para verificar qué versión del script está corriendo la web app.
    if (action === 'ping') return kxcJson({ ok: true, v: 3 });

    if (action === 'create_event') {
      var title = String(b.title || '').trim();
      var start = new Date(b.start);
      var end = new Date(b.end || b.start);
      if (!title || isNaN(start.getTime())) return kxcJson({ ok: false, error: 'bad_input' });
      if (isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 60 * 60000);

      var opts = { description: String(b.description || '') };
      // location: el link de Zoom va como ubicación del evento — es donde
      // Fathom y las apps de calendario detectan la videollamada.
      if (b.location) opts.location = String(b.location);
      // guests: email(s) separados por coma → Google les manda la invitación
      // y pueden responder sí/no/quizás desde su propio calendario.
      if (b.guests) {
        opts.guests = String(b.guests);
        opts.sendInvites = true;
      }
      var event = cal.createEvent(title, start, end, opts);
      // Con invitados, Google mete un Meet automático: sacarlo (es por Zoom).
      var meetRemoved = null;
      if (b.guests) {
        try { meetRemoved = kxcRemoveMeet(event.getId()); } catch (errMeet) { meetRemoved = String(errMeet); }
      }
      // Link directo al evento en la UI de Google Calendar.
      var htmlLink = 'https://calendar.google.com/calendar/event?eid=' +
        Utilities.base64Encode(event.getId().replace('@google.com', '') + ' ' + cal.getId())
          .replace(/=+$/, '');
      return kxcJson({ ok: true, v: 3, eventId: event.getId(), htmlLink: htmlLink, meetRemoved: meetRemoved });
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

    if (action === 'upsert_contact') {
      try {
        return kxcJson(kxcUpsertContact(b.name, b.phone));
      } catch (errC) {
        return kxcJson({ ok: false, error: 'people_api: ' + String(errC) });
      }
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

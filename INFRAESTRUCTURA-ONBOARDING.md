# Infraestructura del onboarding automático — qué lo sostiene y qué NO tocar

> Documento de respaldo para Matías (COO). Explica de qué depende toda la automatización
> que arranca cuando un closer carga una venta en el formulario, y qué cuidar para que no
> deje de funcionar. **Última actualización: 2026-06-11.**

---

## 1. Qué hace el sistema (en una frase)

Cuando un closer completa el **formulario de venta**, en automático se: crea el **cliente** en el
panel (con factura pendiente, tareas y estrategia), se generan las **carpetas en Google Drive** +
el **onboarding** del cliente, se crea el **canal privado de Slack** del cliente, y se avisa al
equipo en **#onboarding-clientes**.

**Clave:** todo esto corre solo, 24/7, en servidores. **No depende de Claude Code** (eso se usó
solo para construirlo). No depende de ninguna PC encendida.

---

## 2. Las cuentas / servicios que lo sostienen

| Servicio | Para qué sirve | Quién la tiene | Plan recomendado |
|---|---|---|---|
| **Supabase** (proyecto `cgdwieoxjoexzlfbxrfc`) | El corazón: base de datos + funciones del servidor (crea cliente, factura, tareas, estrategia, dispara el resto) | Cuenta Korex | **Pago** (para que NO se pause) |
| **Vercel** | Hospeda el **formulario de venta** y el **panel de operaciones** | Cuenta matiasbraszka | Free alcanza |
| **Google (cuenta `soporte@metodokorex.com`)** | Corre los **Apps Script** que crean carpetas de Drive, el onboarding y escriben en la planilla de finanzas | Korex / Matías | — |
| **Google Drive — "Clientes NUEVOS"** (Unidad Compartida) | Donde se crean las carpetas de cada cliente | Korex | — |
| **Slack (app/bot "n8n")** | Crea el canal privado del cliente e invita al equipo | Workspace Korex | — |

### Piezas técnicas (por si un dev futuro las necesita)
- **Funciones de Supabase:** `crear-venta` (la principal), `form-config`, `add-sales-person`.
- **Apps Scripts (Web Apps):** uno crea **carpetas + onboarding**, otro escribe el **alta en la planilla de finanzas**. Corren como `soporte@metodokorex.com`.
- **Carpeta madre Drive "Clientes NUEVOS":** `1aCLCSKHbtOSBhk-2pyKMT4SxmIodJfe3`
- **Documento template de onboarding:** `19wgaW_MbN7aT0NA2sAcI6slad2r9t-2UeuUB2nDGetw`
- **Planilla de finanzas "MKA - Finanzas y Costos":** `1KoTVRO-03V3cvQBKF6d51EDlAbzdroIZ8sa4F5tZUIw`

---

## 3. Las claves/secretos (DÓNDE viven, no los valores)

Ninguna clave está escrita en el código público. Viven en la configuración del sistema
(tabla `app_settings`, fila `venta_form_config`) y algunas se editan desde el panel:

- Contraseña del formulario, webhook de Slack (#onboarding-clientes), **token del bot de Slack**,
  URL + secreto del **Apps Script de carpetas**, URL + secreto del **Apps Script de finanzas**.
- Editables desde el panel: **Configuración → Onboarding** (mensajes, carpetas, calendario,
  excluidos del canal) y **Configuración → Alta en finanzas** (tasas y %).

> ⚠️ Si rotás/cambiás cualquiera de esos tokens o URLs, **hay que actualizarlos en la config** o
> esa parte deja de andar. Avisar al dev antes de rotar.

---

## 4. Qué NO tocar (sin avisar a un desarrollador)

1. **No pausar ni dejar de pagar Supabase.** Es lo único crítico: si se cae, no se cargan ventas.
2. **No borrar ni suspender la cuenta de Google `soporte@metodokorex.com`**, ni quitarle el acceso
   a la Unidad Compartida "Clientes NUEVOS" o al documento template de onboarding.
3. **No borrar la app/bot "n8n" de Slack** ni revocar su token.
4. **No cambiar la contraseña del formulario, los tokens de Slack, ni las URLs de los Apps Script**
   sin actualizar la configuración.
5. **No borrar los proyectos de Vercel** (formulario y panel).
6. **No mover/renombrar** la carpeta "Clientes NUEVOS" ni el documento template.

---

## 5. Qué pasa si algo falla (está diseñado para no perder ventas)

Cada paso externo está protegido: **si falla, la venta IGUAL se carga** en el panel. Nunca se
pierde una venta ni datos. En el peor caso queda una tarea manual:

| Si se cae… | Qué pasa | Qué hacer |
|---|---|---|
| **Supabase** | No se carga la venta (es lo crítico) | Revisar plan/pago de Supabase |
| **Apps Script de carpetas / Google** | La venta se carga, pero faltan las carpetas/onboarding | Crear la carpeta a mano |
| **Slack (bot)** | La venta se carga, pero falta el canal | Crear el canal a mano |
| **Apps Script de finanzas** | La venta se carga, pero no se escribe la fila en la planilla | Cargar la fila a mano |
| **Vercel** | El formulario no abre | Esperar (es muy estable) o revisar Vercel |

---

## 6. Límites (¿podemos saturarlo?)

Para el volumen actual (pocas ventas por día) **no se llega a ningún límite** de Supabase, Google
Apps Script ni Slack. Recién habría que ajustar si se pasara a **cientos de altas por día**.

---

## 7. Resumen de una línea

> **No depende de Claude Code para funcionar.** Lo único realmente crítico es **Supabase
> (mantenerlo en plan pago)**. Todo lo demás, si falla, no frena la venta — solo deja una tarea
> manual. Los únicos riesgos reales: dejar de pagar un servicio, o borrar/cambiar una cuenta o
> token sin actualizar la config.

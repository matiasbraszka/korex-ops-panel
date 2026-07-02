# Marketing — Resumen automático de llamadas → Slack

Cada reunión del **equipo de marketing** (planificación del lunes, dailys mar/mié/jue,
retrospectiva del viernes) se resume solo y se publica en el canal de marketing con el
link de la grabación de Fathom.

## Cómo funciona (rutina Claude en la nube, NO edge function)

Corre sobre la **suscripción de Claude** (claude.ai RemoteTrigger), igual que
*"Procesar llamadas Fathom"* y las rutinas de Soporte. **No usa `ANTHROPIC_API_KEY`.**

- **Trigger:** `trig_018vudTszU8hrrdo4EUHcyFF` — *"Marketing: resumen de llamadas → Slack (prueba DM)"*
- **Horario:** diario `35 4 * * *` UTC = **01:35 AR** (después de *Procesar llamadas Fathom*, 01:00 AR, que es quien vuelca el inbox de Fathom a la tabla `llamadas`).
- **Conectores MCP:** Supabase (`cgdwieoxjoexzlfbxrfc`) + Slack.

### Qué hace en cada corrida
1. Lee la config `app_settings.reuniones_config.marketing_auto` + `grupos.marketing.channel` + `test_dm_to` + `canvas_id`.
2. Busca en `llamadas` las de `categoria='equipo'` con `mkt_resumen_status is null` dentro del `lookback_days`, y su transcripción (`llamadas_inbox.transcript` vía `inbox_id`).
3. **Detección** = título (`marketing`/`semanal`/`planificación`/`retrospectiva`) o ≥2 participantes del equipo de marketing (José Martín, María, José Zerillo, David) **+ la IA confirma** leyendo la transcripción (si no es de marketing → `skipped`).
4. Escribe el resumen de **5 secciones**: Contexto · Wins · Cuellos de botella · Insights · Tareas nuevas y foco.
5. **Guarda el resumen COMPLETO en el Canvas** (`canvas_id`), la sesión más nueva arriba de todo (debajo de la intro). Es el archivo permanente y buscable — la salida principal.
6. **Aviso corto** al destino: canal `grupos.marketing.channel` si `test_mode=false`, o DM a Matías si `test_mode=true`. Texto: "Resumen cargado → link al Canvas" (NO el resumen completo).
7. Marca `mkt_resumen_status='sent'` solo si el Canvas se actualizó OK (si falla, reintenta la próxima corrida).

### Canvas (bitácora)
Canvas **"Reuniones Equipo de marketing"** = `F0BEPE88QJH`
(https://metodokorex1.slack.com/docs/T07NCGMQT5Z/F0BEPE88QJH). El id vive en
`reuniones_config.marketing_auto.canvas_id`.

> **OJO:** un canvas creado por el MCP de Slack queda **privado del conector** y no
> se puede compartir con el equipo (no hay tool de share/access). Por eso la bitácora
> vive en un canvas que **creó Matías** (el MCP sí puede leer/escribir en él). Matías
> debe **compartirlo** con #equipo-marketing/workspace para que el equipo lo vea.

## Gemela: Socios

Misma máquina para las **daily de socios** (Matías · Cristian · Marcos), independiente:
- **Trigger:** `trig_01SVod45SUfFFL1vYkYVUjku` — "Socios: resumen de dailies", diario `45 4 * * *` UTC (01:45 AR).
- **Columnas:** `llamadas.soc_resumen_status` / `soc_resumen_at`. **Config:** `reuniones_config.socios_auto` (mismos campos). **Canal:** `grupos.socios.channel` = `C0ADMC3HMED` (#socios-privado). **Canvas:** `F0BELNR5YQ3` ("Reuniones socios", de Matías).
- **Detección:** título con 'socios' o ≥2 de {Matías, Cristian, Marcos} + la IA confirma que es reunión de socios (no marketing/tech/ventas/cliente).
- Arrancó en `test_mode=true` (DM a Matías) por ser contenido sensible; cutover al canal cuando valide.

## Modo prueba → producción

Config en `app_settings.reuniones_config.marketing_auto`:

| Campo | Qué hace |
|---|---|
| `test_mode` | `true` = DM a Matías (validación). `false` = postea al canal de marketing (`grupos.marketing.channel`, C0AD6U6J685). |
| `lookback_days` | Ventana de llamadas a mirar (default 7). |
| `max_per_run` | Tope de llamadas por corrida (default 4). |
| `enabled` | Interruptor general. |
| `canvas_id` | Canvas de Slack donde se archiva cada sesión (bitácora). |

**Pasar a producción** (cuando Matías valide los resúmenes de prueba):
```sql
update app_settings
set value = jsonb_set(value, '{marketing_auto,test_mode}', 'false'::jsonb)
where key = 'reuniones_config';
```

## Correr a mano (para probar sin esperar al horario)
Vía RemoteTrigger `run` sobre `trig_018vudTszU8hrrdo4EUHcyFF`. Con `test_mode=true`
manda los resúmenes por DM a Matías. Para re-probar una llamada ya posteada, primero:
```sql
update llamadas set mkt_resumen_status=null, mkt_resumen_at=null where id='<llm_id>';
```

## Estado en la base
`migrations/marketing_resumen_v1.sql` — columnas `mkt_resumen_status` / `mkt_resumen_at`
en `llamadas` + seed de `marketing_auto`.

> Nota: hubo un intento inicial con un edge function (`marketing-resumen`) que llamaba a
> la API de Anthropic con `ANTHROPIC_API_KEY`. Se descartó: el proyecto usa la
> **suscripción de Claude** (rutinas en la nube), no la API key. El pg_cron de ese
> intento quedó des-agendado; si el edge function `marketing-resumen` sigue desplegado
> en Supabase, está inerte y se puede borrar con `supabase functions delete`.

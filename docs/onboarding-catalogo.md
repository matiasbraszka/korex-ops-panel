# El onboarding del cliente — dónde está cada cosa

> Este archivo tenía el volcado completo de las 66 preguntas del onboarding v1.
> Ese catálogo se dio de baja en `portal_v29`. El catálogo ya no se documenta en
> un `.md`: se edita en **Operaciones → Administración → Onboarding**, y ahí se
> ve con los estilos reales del cliente. Un documento aparte queda desactualizado
> en cuanto alguien toca una pregunta desde el panel.

## Qué es

El cuestionario que completa un cliente nuevo en `clientes.metodokorex.com`
antes de la sesión de onboarding. Reemplaza al Google Doc que se mandaba por
WhatsApp.

**4 bloques · 23 pasos · 39 pantallas · 125 preguntas** (93 obligatorias, 13
condicionales, 45 con micrófono, 62 con ejemplo).

| Bloque | Qué cubre | Qué abre al cerrarse |
|---|---|---|
| 1 · Arranque | La sesión agendada, los datos del contrato | — |
| 2 · Estrategia | Foco, negocio, equipo, oferta, tono, competencia, historia | Guiones y Embudos |
| 3 · Operación | Audiencia, canales, dominio, WhatsApp, Meta, compliance | — |
| 4 · Materiales | Archivos, delegado, grabación, control de calidad | Material |

## Dónde se edita

**Operaciones → Administración → Onboarding** (`/admin/onboarding`, solo admin).

Se puede cambiar todo lo que ve el cliente: la pregunta, la aclaración, el
ejemplo, las opciones, los chips, el largo pedido, si es obligatoria, en qué
pantalla va y cuándo se muestra. Los cambios **los ven todos los clientes que
estén completando el onboarding en ese momento**, en cuanto recarguen. Los que ya
lo entregaron no se tocan.

Dos cosas no se pueden editar, a propósito:

- **`qkey`** — es la clave con la que viven las respuestas ya dadas. Renombrarla
  no rompe nada visible: rompe el consumo del cerebro en silencio.
- **La columna de destino** — es una lista cerrada a lo que
  `onboarding_writeback` sabe escribir. Agregar una nueva necesita migración.

Quitar una pregunta la **desactiva**, no la borra: lo que el cliente ya contestó
se conserva y deja de contar.

## Adónde va lo que responde

```
el cliente responde
     └─▶ onboarding_answers (una fila por respuesta, autosave a los 900 ms)
          ├─▶ del_sections del documento onb_<cliente>, una sección por paso
          │    └─▶ client_brain_docs.text        ← lo que leen los agentes de IA
          ├─▶ client_brain_docs.panel_html       ← la maqueta que lee el equipo
          └─▶ al 100%: columnas de clients / strategy_pages + tareas al equipo
```

El texto se reescribe **cada 2 minutos** mientras el cliente contesta (cron
`onboarding-sync-texto`), así que el equipo ve el avance sin esperar a que
termine. Aparece en el DEL del cliente como un documento más.

### Quién ve el onboarding

Solo los clientes **nuevos**. El run nace por dos caminos explícitos: el trigger
de alta del cliente (`onboarding_preparar`) y la invitación desde el panel
(`onboarding-invitar`). `portal_onboarding_estado` **lee** el run, no lo crea —
antes lo creaba, y un cliente viejo abriendo su portal estrenaba un onboarding
que ya había hecho por el camino anterior. Quien no tiene run no ve nada, y
`portal_cliente_inicio` ya contempla ese caso (`{existe:false, completo:true}`).

Para dárselo a un cliente viejo a propósito: **Invitar al onboarding** desde su
ficha. Eso crea el run igual que antes.

### Dos representaciones, y no son intercambiables

| Columna | Forma | Quién la lee |
|---|---|---|
`client_brain_docs.panel_html` | maqueta: portada con el avance por bloque, encabezado por bloque, un H2 por paso, las respuestas largas en tarjeta y las cortas en tabla | las personas, en la pestaña del DEL |
`client_brain_docs.text` | `P: …` / `R: …` plano, con los marcadores `===== paso =====` | los agentes de IA |
`del_sections.html` | **vacío a propósito** | nadie |

Lo último importa: `del_assemble_text` prefiere `html` sobre `text` cuando el
html no está vacío, y lo aplana reemplazando cada etiqueta por un espacio. Si la
maqueta viviera ahí, el texto que consumen los agentes se volvería una sola
línea sin la estructura P:/R:.

La plantilla **es el catálogo**: no hay HTML escrito a mano en ningún lado. Al
guardar en el constructor se llama a `onboarding_refrescar_documentos()`, que
marca sucios los runs en curso para que sus documentos se rearmen con la forma
nueva. Los onboardings ya entregados no se tocan.

La pestaña es de **solo lectura** en el DEL. No es una limitación: es lo que
impide que una edición a mano quede pisada en la siguiente pasada — o peor, que
congele la pestaña en una foto vieja mientras el cliente sigue contestando.

Los archivos van a las carpetas de recursos del cliente según el `bucket` de
cada campo: los pesados a Bunny, las imágenes y lo liviano a Supabase Storage.

## El porcentaje

`obligatorias respondidas / obligatorias visibles`. Una respuesta cuenta cuando
llega al **60% del largo pedido** — el medidor sigue mostrando el camino hasta el
100%, pero el progreso no se mueve en fracciones.

La regla vive en dos lugares que **hay que mover juntos**:
`public._onboarding_lleno()` en la base y `apps/portal/src/onboarding/progreso.js`
en el portal. `progreso.prueba.mjs` comprueba que digan lo mismo.

## Los archivos

| Qué | Dónde |
|---|---|
| El prototipo que define todo esto | `docs/onboarding-v2-fuente.jsx` |
| El generador del catálogo | `migrations/portal_v29_generador.cjs` |
| Esquema, catálogo, progreso, texto, hooks | `migrations/portal_v28…v35_*.sql` |
| Lo que ve el cliente | `apps/portal/src/onboarding/` |
| El constructor | `apps/operations/src/pages/OnboardingBuilderPage.jsx` |

## Lo que todavía falta cargar

1. **Disponibilidad del equipo** en el calendario `onboarding`. Está sembrado con
   `member_ids` vacío a propósito, así que hoy **no ofrece una sola fecha**: el
   paso 00 cae en su salida de emergencia ("seguí sin agendar") y avisa al equipo.
2. **Los videos.** Hay lugar para uno por paso más el de bienvenida. Si no hay
   URL, el reproductor no se muestra. Los dos que más faltan son el de dónde
   copiar el link de Facebook y el ejemplo de HeyGen, que el paso 20 promete
   *antes* de preguntar si autoriza.
3. **Ejemplos reales.** Los que están son de "María González, enfermera": buenos
   como vara, pero una respuesta real de un cliente que contestó bien es la
   edición de mayor impacto de todo el onboarding.
4. **Los 45 minutos que promete la bienvenida no dan.** Los propios contadores
   por paso suman 165. Es texto editable desde el constructor.

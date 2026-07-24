# Playbook: cómo se crea un agente nuevo en Codex

Este es el paso a paso para crear CUALQUIER agente de la fábrica. Documento hermano de
`DESARROLLO-AGENTES.md` (que explica cómo probar sin deployar — leelo también).

La arquitectura en una línea: **agente nuevo = 1 fila en `marketing_subagents` (con su
manifest en `config`) + 1 módulo `supabase/functions/agent-run/agents/<key>.ts` + su
capacitación en el panel (Cerebro)**. Todo lo demás —auth, topes de gasto, registro en
`api_usage`, prompt caching, línea de Fuentes, thinking apagado, red anti-truncado— lo pone
el host (`agent-run/index.ts` + `_shared/agent-runtime.ts`) y el agente lo hereda gratis.

Los 4 agentes históricos (anuncios, vsl, landing, descubrimiento) siguen en `agent-chat`
(legacy): NO se migran acá hasta que la fábrica haya sostenido 2+ agentes en producción.

---

## Paso 1 — Definir el rol (papel y lápiz, sin código)

- **key**: corta, en minúsculas (`analista`, `formularios`, …). Es el id para siempre.
- **nivel**: ¿trabaja sobre un funnel (`funnel`) o sobre el cliente antes de que exista un
  funnel (`cliente`, como descubrimiento)?
- **salida**: ¿markdown que el panel pinta (lo normal), o emisión estructurada con tool
  (como anuncios/vsl, solo si el panel arma tarjetas con eso)?
- **datasets**: ¿qué datos de la base necesita leer? (mirá los builders del analista como
  catálogo de ejemplo).
- ¿En qué se diferencia de los agentes que ya existen? Si la respuesta es "en poco", es
  capacitación nueva para un agente existente, no un agente nuevo.

## Paso 2 — La fila en la base (nace oculto)

```sql
INSERT INTO marketing_subagents (key, name, position, active, instructions, config) VALUES
  ('<key>', '<Nombre visible>', <n>, false, '', '{
    "runtime": "agent-run",
    "nivel": "funnel",
    "max_tokens": { "chat": 6000, "generate": 4096 },
    "datasets": [...],
    "formato": "<key>",
    "tool": null,
    "presupuesto": { "dossier": 120000 }
  }'::jsonb);
```

`active=false` SIEMPRE al crear: el picker del panel lo filtra y nadie ve un agente a medio
hacer. El `.sql` va a `migrations/` y se aplica coordinado con Matías (regla del repo).

## Paso 3 — Instructions del especialista

El system prompt del rol: quién es, su north star, su método, qué NO hace, con quién habla.
Se escribe en el panel (Cerebro → el agente) o se versiona en `corpus-src/<key>/instructions.md`
y se carga. Tope duro: **24.000 caracteres** (el mismo del loop de mejora). Lo que es
formato de salida NO va acá: va en el módulo (paso 5) — es contrato con el frontend.

## Paso 4 — Capacitación inicial (Cerebro)

3-5 piezas en `marketing_training_material` (scope = la key), versionadas en
`corpus-src/<key>/`. Filosofía Korex: **ejemplo barato > regla cara**. Cada pieza entra al
prompt clipada a **2.500 caracteres**: piezas cortas y densas, no manuales.
Si el agente necesita un corpus grande con retrieval (como VSL/funnels), es un script
`scripts/<key>-corpus-load.mjs` clonado de `vsl-corpus-load.mjs`, con su `part` propio en
`marketing_ad_library` y su tester `scripts/<key>-corpus-test.mjs`.

## Paso 5 — El módulo (el único código nuevo)

`supabase/functions/agent-run/agents/<key>.ts` implementando `AgentModule` (ver
`agents/types.ts`):

- `buildContext(ctx)` → `{ estable, recuperado, fuentes, meta }`. Lo ESTABLE en la
  conversación (dossier del cliente/funnel) va en `estable` (se cachea a 0,1x del turno 2
  en adelante); lo que depende del último mensaje va en `recuperado` (no se cachea).
- Presupuesto de caracteres: el material que el agente de verdad usa entra ENTERO (tope
  arriba del caso real más grande); lo que se recorta se ANOTA en el prompt. Nunca mandar
  medio documento sin avisar.
- `fuentes`: qué se cargó de verdad, para la línea **Fuentes** (✓/⚠/✗) — la calcula el
  código, jamás el modelo.
- Si hay datos que pueden faltar, el patrón es el bloque **COBERTURA DE DATOS** del
  analista: cada dataset con su estado y su REMEDIO concreto, calculados por código.
- `formato`: el contrato de salida con el panel.
- Registrarlo en `MODULES` en `agent-run/index.ts` (una línea).

## Paso 6 — Probar en local, sin deployar

```bash
node scripts/agent-fn-local.mjs --fn agent-run     # terminal 1
# apps/operations/.env.local → VITE_AGENT_FN_URL=http://localhost:8000
cd apps/operations && npm run dev                  # terminal 2
```

(Ver `DESARROLLO-AGENTES.md` para el setup del `.env`.) Iterar acá el prompt, el dossier y
el formato hasta que las respuestas citen números reales y la cobertura marque bien lo que
falta. OJO: la función local pega a la DB REAL y gasta API real (queda en `api_usage`).

## Paso 7 — Shadow en producción (deployado pero invisible)

Deploy de `agent-run` (por MCP, como siempre las functions). Como el agente sigue
`active=false` y sin entrada en `agentMeta.js`, nadie lo ve. Probarlo contra la función
deployada (curl con `x-cron-secret`, o el panel local apuntando a prod) con el cliente
piloto. Revisar en `api_usage` el costo por corrida y el `meta.retrieval`.

## Paso 8 — Feedback loop encendido

El circuito ya existe: `agent_feedback` (👍/👎 del equipo) → `agent-feedback-triage` (cron
diario) → `agent_improvements` (propuestas) → `apply-improvement` (aplica lo aprobado).
Usarlo desde el día 1 del piloto: los errores del agente se convierten en ejemplos/reglas
de capacitación en vez de quedar en el aire.

## Paso 9 — Go-live (el orden importa)

1. La función ya está deployada (paso 7).
2. `update marketing_subagents set active = true where key = '<key>';`
3. Entrada en `apps/operations/src/components/agentes/agentMeta.js` (ícono, descripción,
   atajos del composer, `live: true`) + el ruteo del chat a `agent-run` para las keys con
   `config.runtime = "agent-run"` (en `AgentChat.jsx`) + push a `main`.

Si activás antes de deployar, el equipo ve un agente que no anda. Nunca al revés.

## Paso 10 — La primera semana

- Mirar `api_usage` (costo por corrida, `cache_read` vs `fresh`: si cache_read viene en 0,
  algo rompe el cache y estás pagando de más).
- 5-10 corridas reales validadas a mano contra lo que el equipo ya sabe.
- Lo que el agente hizo mal → feedback en el panel, no un parche a mano en el prompt: que
  el loop lo convierta en capacitación.

---

## Checklist corto

- [ ] Rol definido (key, nivel, salida, datasets)
- [ ] Fila en `marketing_subagents` con `active=false` + manifest (`migrations/…`)
- [ ] Instructions (≤24k) cargadas
- [ ] 3-5 piezas de capacitación en Cerebro (≤2,5k c/u), versionadas en `corpus-src/<key>/`
- [ ] Módulo `agents/<key>.ts` + línea en `MODULES`
- [ ] Probado en local (`--fn agent-run`) con datos reales
- [ ] Deploy shadow + smoke con piloto + costo revisado en `api_usage`
- [ ] Feedback loop activo
- [ ] Go-live: active=true → agentMeta + ruteo → push

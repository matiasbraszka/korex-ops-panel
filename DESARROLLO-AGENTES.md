# Probar un agente sin tocar producción

`agent-chat` es **una sola edge function compartida** por todos los agentes de marketing
(Anuncios, VSL, Copy de Funnels…). Deployarla para probar un agente nuevo pone en riesgo a
los otros, que están en vivo. Con esto se prueba el agente completo — chat real, corpus real,
gate real, contra la base de verdad — **sin deployar nada**.

Corre con **Deno**, el mismo runtime que usa Supabase, así que lo que probás es exactamente
lo que después se deploya. No hace falta Docker.

## Preparar (una sola vez)

```bash
npm i -D deno                                        # desde la raíz del repo
cp scripts/agent-fn-local.env.example scripts/agent-fn-local.env
```

Completá `scripts/agent-fn-local.env` con los datos del dashboard de Supabase
(**Project Settings → API**): la Project URL, la clave `anon` y la clave `service_role`
(botón *Reveal*).

> La `service_role` saltea RLS: es la que usa la edge fn cuando está deployada, y sin ella la
> función local no puede leer las tablas — respondería vacío, que es peor que fallar, porque
> parece que anda. El archivo está gitignoreado: no se commitea nunca.

## Probar

```bash
node scripts/agent-fn-local.mjs                      # terminal 1: la edge fn, en localhost:8000
```

```bash
echo "VITE_AGENT_FN_URL=http://localhost:8000" >> apps/operations/.env.local
cd apps/operations && npm run dev                    # terminal 2: el panel
```

Abrí `/marketing/agentes` y usá el agente normalmente. La función se reinicia sola cuando
guardás `supabase/functions/agent-chat/index.ts`, así que se puede iterar el prompt sin
frenar nada.

**Producción no se entera:** sigue corriendo la versión deployada. El único que cambia de
lado es tu panel local, por la variable `VITE_AGENT_FN_URL`.

## Volver a producción

Sacá `VITE_AGENT_FN_URL` de `apps/operations/.env.local` y reiniciá el dev server.

## Qué NO cubre esto

La función local **escribe en la base real**: `api_usage` registra el gasto igual (la API de
Anthropic se paga lo mismo) y los topes diario/mensual aplican igual. Lo único que no toca es
la edge function deployada.

## Cuando el agente ya está validado

1. Deployar `agent-chat` (es lo que lo pone en producción de verdad).
2. Activarlo en el picker: `update marketing_subagents set active = true where key = '<key>'`.
   Hasta ese momento conviene dejarlo en `false`, así no aparece a medio hacer.
3. `live: true` en `agentMeta.js` + push a `main` (el frontend se deploya solo en Vercel).

El orden importa: si activás el agente antes de deployar la función, el equipo lo ve en el
picker y no anda.

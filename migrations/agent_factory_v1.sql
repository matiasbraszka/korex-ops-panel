-- agent_factory_v1 — la "fábrica de agentes": config declarativa por agente + el analista.
--
-- Hasta acá, crear un agente nuevo obligaba a tocar agent-chat/index.ts en ~6 lugares
-- (corpus, formato, tool, gate, retrieval, nivel). Este manifest mueve a DATOS lo que es
-- CONFIGURACIÓN — qué runtime lo atiende, qué datasets carga, cuánto presupuesto de
-- caracteres tiene — y deja en CÓDIGO lo que es implementación (los builders, los formatos,
-- las tools viven en supabase/functions/agent-run/agents/<key>.ts, versionadas en el repo).
-- Un jsonb con SQL o prompts adentro sería inauditable; el manifest ELIGE piezas, no las define.
--
-- Aditivo a propósito: agent-chat no selecciona esta columna, así que los 4 agentes vivos
-- no se enteran. El agente nuevo nace con active=false → el picker del panel no lo muestra.

-- ── 1) Manifest declarativo por agente ──────────────────────────────────────
ALTER TABLE public.marketing_subagents
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.marketing_subagents.config IS
  'Manifest del agente (fábrica de agentes). Claves: runtime (edge fn que lo atiende; '
  'ausente = agent-chat legacy), nivel (cliente|funnel), max_tokens {chat,generate}, '
  'datasets (qué builders de datos corren), formato (clave del registro de formatos en '
  'código), tool (nombre de tool de emisión o null), presupuesto {dossier: chars}. '
  'Elige piezas implementadas en agent-run/agents/<key>.ts; nunca contiene SQL ni prompts.';

-- ── 2) El primer agente de la fábrica: el Analista de Métricas ──────────────
-- active=false: invisible en el picker hasta que Matías valide el shadow.
-- El modelo por agente sigue mandándose desde app_settings.api_config.chat_models.analista;
-- si no está, cae al chat_model global (hoy claude-sonnet-5) — igual que los demás.
INSERT INTO public.marketing_subagents (key, name, position, active, instructions, config) VALUES
  ('analista', 'Analista de Métricas', 7, false, '', '{
    "runtime": "agent-run",
    "nivel": "funnel",
    "max_tokens": { "chat": 6000, "generate": 4096 },
    "datasets": ["meta_ads", "spend", "leads", "clarity", "vsl", "contenido", "ventas"],
    "formato": "analista",
    "tool": null,
    "presupuesto": { "dossier": 120000 }
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

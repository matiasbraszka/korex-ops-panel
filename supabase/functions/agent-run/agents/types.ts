// supabase/functions/agent-run/agents/types.ts
// La interfaz que implementa CADA módulo de agente de la fábrica.
//
// Un agente nuevo = 1 fila en marketing_subagents (con su manifest en `config`)
//                 + 1 módulo agents/<key>.ts que implementa esto
//                 + su capacitación en el panel (Cerebro).
// El host (agent-run/index.ts) pone todo lo demás: auth, topes, cache, usage, fuentes.

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { Fuente, Msg } from "../../_shared/agent-runtime.ts";

export type AgentCtx = {
  supabase: SupabaseClient;
  clientId: string;
  strategyId: string;
  funnelId: string;
  avatarId: string;
  mode: "chat" | "generate";
  messages: Msg[];
  // El manifest del agente (marketing_subagents.config): datasets, presupuesto, etc.
  manifest: Record<string, unknown>;
};

export type AgentContextResult = {
  // Estable dentro de la conversación (mismo cliente/funnel) → 2º breakpoint de cache.
  estable: string;
  // Lo recuperado según el último pedido → sin cachear. Vacío si el agente no lo usa.
  recuperado: string;
  // Para la línea de Fuentes (la calcula el código, no el modelo).
  fuentes: Fuente[];
  // Va a api_usage.meta.retrieval: la única forma de auditar qué cargó sin adivinar.
  meta?: Record<string, unknown>;
};

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

export interface AgentModule {
  key: string;
  // Qué nivel de contexto exige: "funnel" pide client_id + funnel_id; "cliente" solo client_id.
  nivel: "cliente" | "funnel";
  // El bloque de formato propio del agente (contrato con el frontend, NO editable en el panel).
  formato: string;
  // Herramienta de emisión estructurada (solo en modo generate). Opcional.
  tool?: ToolDef;
  buildContext(ctx: AgentCtx): Promise<AgentContextResult>;
}

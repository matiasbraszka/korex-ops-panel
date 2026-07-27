-- agente_cuenta_v1 — "Situación del cliente": el segundo agente de la fábrica.
--
-- Responde las preguntas que hoy no tienen dueño: ¿en qué situación está este cliente?
-- ¿qué lo tiene trabado? ¿qué tan conforme está? ¿pagaría una mensualidad? Cruza wa_briefings,
-- llamadas, tasks, fin_incomes, cerebro_pipeline_status y clients.bottleneck — datos que ya
-- existen pero que hoy nadie mira juntos.
--
-- NO se pisa con Descubrimiento: aquel razona sobre el MERCADO del cliente (líder,
-- competencia, avatar) leyendo client_brain_docs; éste sobre la RELACIÓN con el cliente.
-- Cero solapamiento de tablas. Descubrimiento no se toca.
--
-- nivel = "cliente": se elige un cliente y se habla de él, igual que Descubrimiento. El
-- frontend ya soporta ese camino (AgentesPage.jsx, soloCliente) — no hace falta UI nueva.
--
-- active=false: el picker del panel lo filtra. Se activa recién en el go-live, DESPUÉS de
-- deployar agent-run con el módulo agents/cuenta.ts. Nunca al revés.

INSERT INTO public.marketing_subagents (key, name, position, active, instructions, config) VALUES
  ('cuenta', 'Situación del cliente', 8, false, '', '{
    "runtime": "agent-run",
    "nivel": "cliente",
    "max_tokens": { "chat": 10000, "generate": 4096 },
    "datasets": ["ficha", "fechas", "publicidad", "calidad", "retrasos", "entregas", "cobros", "satisfaccion", "llamadas", "timeline"],
    "formato": "cuenta",
    "tool": null,
    "presupuesto": { "dossier": 140000 }
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

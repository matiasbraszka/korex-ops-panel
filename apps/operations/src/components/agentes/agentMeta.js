// Capa visual de los agentes de marketing. La lista real vive en la tabla
// `marketing_subagents` (DB) — acá solo va lo que no tiene sentido guardar en la base:
// qué ícono le toca a cada uno, su descripción corta y los atajos del composer.
//
// `live: true` = el backend (edge fn agent-chat) ya sabe responder por ese agente.
// Los demás se muestran con el cartel "Pronto" y no se pueden abrir.
import { Megaphone, Video, Target, ClipboardList, ShieldCheck, Bot } from 'lucide-react';

// `general` no es un agente de chat: es la capa base (ADN Korex) que heredan
// todos los demás. Se edita en Marketing → Configuración, no se chatea con él.
export const BASE_AGENT_KEY = 'general';

// Cada atajo tiene un `label` corto (lo que se ve en el chip, para que entren en
// una sola fila) y el `prompt` completo que realmente se le manda al agente.
export const AGENT_META = {
  anuncios: {
    Icon: Megaphone,
    desc: 'Creativos y copy para Meta Ads',
    live: true,
    suggestions: [
      { label: 'Ángulos nuevos', prompt: 'Generá 3 anuncios con ángulos nuevos para este avatar' },
      { label: 'Variar los ganadores', prompt: 'Basate en los anuncios ganadores y proponé variaciones distintas' },
      { label: 'Hooks para frío', prompt: 'Dame 5 ganchos (hooks) potentes para tráfico frío' },
      { label: 'Ángulo sin explotar', prompt: '¿Qué ángulo todavía no estamos explotando con este avatar?' },
      { label: 'Bajar a Reels', prompt: 'Pasá estos ángulos a variantes cortas para Reels, de 3 líneas' },
    ],
  },
  vsl: {
    Icon: Video,
    desc: 'Guiones de VSL (el paso previo a los anuncios)',
    live: true,
    suggestions: [
      { label: 'Guion completo', prompt: 'Escribí el guion de VSL completo para este avatar, siguiendo el método Korex' },
      { label: '5 hooks', prompt: 'Dame 5 hooks distintos para el VSL de este avatar, con el Hook A incluido' },
      { label: '¿Qué caso clonar?', prompt: '¿Qué VSL de la biblioteca es el más cercano a este avatar y por qué? ¿Qué le funcionó en retención?' },
      { label: 'Revisar el guion', prompt: 'Revisá el guion de VSL que ya tiene este funnel contra el checklist del blueprint y decime qué falla' },
      { label: 'Alargar o acortar', prompt: '¿Este avatar necesita un VSL de 6 minutos o uno largo? Justificá con los criterios del blueprint' },
    ],
  },
  landing: {
    Icon: Target,
    desc: 'Copy y estructura de landings',
    live: false,
    suggestions: [
      { label: 'Copy de la landing', prompt: 'Escribí el copy de la landing para este avatar' },
      { label: 'Estructura', prompt: 'Proponé una estructura de secciones para la landing' },
    ],
  },
  formularios: {
    Icon: ClipboardList,
    desc: 'Preguntas de calificación de leads',
    live: false,
    suggestions: [
      { label: 'Armar preguntas', prompt: 'Armá las preguntas del formulario para calificar leads' },
      { label: 'Calificar mejor', prompt: '¿Qué preguntas agregarías para calificar mejor a los leads?' },
    ],
  },
  auditor: {
    Icon: ShieldCheck,
    desc: 'Revisión y compliance de Meta',
    live: false,
    suggestions: [
      { label: 'Revisar compliance', prompt: 'Revisá este copy contra las políticas de Meta' },
    ],
  },
};

const FALLBACK = { Icon: Bot, desc: 'Agente de marketing', live: false, suggestions: [] };

export const agentMeta = (key) => AGENT_META[key] || FALLBACK;

// Los agentes que se pueden elegir en el selector (todos menos la capa base).
export const chatAgents = (subagents) =>
  (subagents || [])
    .filter((s) => s.key !== BASE_AGENT_KEY && s.active !== false)
    .map((s) => ({ ...s, ...agentMeta(s.key) }));

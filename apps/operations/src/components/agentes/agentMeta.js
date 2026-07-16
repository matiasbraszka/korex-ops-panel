// Capa visual de los agentes de marketing. La lista real vive en la tabla
// `marketing_subagents` (DB) — acá solo va lo que no tiene sentido guardar en la base:
// qué ícono le toca a cada uno, su descripción corta y los atajos del composer.
//
// `live: true` = el backend (edge fn agent-chat) ya sabe responder por ese agente.
// Los demás se muestran con el cartel "Pronto" y no se pueden abrir.
import { Megaphone, Video, Route, ClipboardList, ShieldCheck, Bot, Compass } from 'lucide-react';

// `general` no es un agente de chat: es la capa base (ADN Korex) que heredan
// todos los demás. Se edita en Marketing → Configuración, no se chatea con él.
export const BASE_AGENT_KEY = 'general';

// Cada atajo tiene un `label` corto (lo que se ve en el chip, para que entren en
// una sola fila) y el `prompt` completo que realmente se le manda al agente.
export const AGENT_META = {
  // El único que trabaja a nivel CLIENTE: corre en la fase de arranque, antes de que existan
  // funnels y avatares (el avatar es su SALIDA). De ahí que `nivelCliente` lo exceptúe del
  // candado que exige elegir funnel+avatar para abrir el chat.
  descubrimiento: {
    Icon: Compass,
    desc: 'La fase de arranque: research, competencia, onboarding, estrategia y avatar',
    live: true,
    nivelCliente: true,
    // Cada atajo nombra su paso a propósito: es lo que lee el ruteo de agent-chat (PASOS_DESC)
    // para saber qué metodología cargar. El primero no nombra ninguno — es el caso normal de
    // abrir el chat sin saber en qué punto está el cliente, y ahí manda el gate.
    suggestions: [
      { label: '¿En qué paso estamos?', prompt: '¿En qué momento del descubrimiento está este cliente y qué paso corresponde ahora?' },
      { label: 'Research del líder', prompt: 'Hacé el research del líder y su empresa con fuentes públicas' },
      { label: 'Competencia', prompt: 'Analizá los ads de la competencia del ad library' },
      { label: 'Consolidar onboarding', prompt: 'Consolidá el onboarding del cliente separando lo confirmado de lo que hay que validar' },
      { label: 'Qué estrategia va primero', prompt: 'Hacé el análisis estratégico: qué estrategia desarrollamos primero, a qué avatares apuntamos con ella, y con qué virtudes del cliente y de la empresa. Con scores y evidencia.' },
      { label: 'Profundizar el avatar', prompt: 'Profundizá el avatar prioritario en su hoja psicológica completa, con el botón caliente' },
    ],
  },
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
    Icon: Route,
    desc: 'Copy del funnel completo: pre-landing, landing VSL, formulario y thank you page',
    live: true,
    // Los atajos nombran la página a propósito: con eso el agente sabe si traer esa página
    // de varios funnels parecidos (para comparar) o el recorrido entero de un solo caso.
    suggestions: [
      { label: 'Funnel completo', prompt: 'Escribí el copy del funnel completo para este avatar: pre-landing, landing VSL, formulario y thank you page' },
      { label: 'Auditar la pre-landing', prompt: 'Auditá la pre-landing de este funnel contra el blueprint: qué está mal, por qué, y cómo queda reescrito' },
      { label: 'Titulares', prompt: 'Dame 5 titulares para la pre-landing con las fórmulas del blueprint, y decime cuál elegirías' },
      { label: 'Preguntas del formulario', prompt: 'Armá las preguntas del formulario de calificación para este avatar' },
      { label: 'Thank you page', prompt: 'Escribí la thank you page para que quede clarísimo cuál es el próximo paso' },
      { label: '¿Qué caso clonar?', prompt: '¿Qué funnel de la biblioteca es el más cercano a este avatar y por qué? ¿Qué estructura le clonarías?' },
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

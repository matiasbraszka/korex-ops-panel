// supabase/functions/procesar-pendientes/index.ts
// Procesa llamadas pendientes del inbox usando Claude API directamente.
// Maximo 5 por invocacion (timeout de 150s).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MAX_PER_RUN = 5;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

function generateLlmId(): string {
  const ts = Math.floor(Date.now() / 1000);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `llm_${ts}_${rnd}`;
}

async function callClaude(transcript: string, clientesText: string, recordingStartTime: string | null): Promise<Record<string, unknown> | null> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

  const prompt = `Sos analista de llamadas de Metodo Korex. Analiza el transcript y devuelve SOLO un JSON valido (sin texto antes ni despues, sin markdown).

ESTRUCTURA EXACTA:
{
  "categoria": "cliente" | "consultoria" | "equipo" | "mentoria" | "ventas",
  "equipo_subtipo": "marketing" | "socios" | "programacion" | "abogada" | "equipo" | null,
  "titulo": "<MAX 60 chars. Formato: 'Persona/Empresa - Tema'. Ej: 'Sergio Canovas - Revision campanas Kangen'. NO 'Sala de reuniones', NO 'Impromptu Zoom', NO largo.>",
  "cliente_mencionado": "<nombre del cliente principal o null>",
  "participantes": ["Nombre 1", "Nombre 2"],
  "duracion_min": <entero o null>,
  "resumen": "<3-5 frases concretas. Que se hablo, que se decidio.>",
  "proximos_pasos": [{ "accion": "...", "responsable": "...", "plazo": "...", "urgencia": "normal" | "high" }],
  "feedback": [{ "tipo": "queja" | "mejora", "area": "marketing" | "empresa" | "producto", "texto": "...", "descripcion": "cita textual" }],
  "problemas_detectados": ["..."],
  "objeciones": ["..."],
  "notas_clave": "<parrafo de contexto>"
}

CATEGORIAS:
- cliente: con cliente que paga
- consultoria: entrenamientos a equipos de clientes (10+ personas)
- equipo: interna Korex
- mentoria: con mentor externo (Alberto Rodilla, Quini Amores, etc)
- ventas: con prospecto no-cliente

EQUIPO_SUBTIPO (SOLO cuando categoria es "equipo" o "mentoria"; sino null):
- marketing: reunion del area de marketing (Jose Martin/CMO, Maria, Jose Zerillo, David). Temas: campanas, creativos, landings, copy, embudos.
- socios: reunion entre los socios de Korex (Matias, Cristian, Marcos). Temas: estrategia, finanzas, decisiones de empresa.
- programacion: reunion del area de programacion/tecnica (Marcos/CTO, Christian Uscanga, Mikel). Temas: desarrollo, bugs, sistema, plataforma.
- abogada: reunion con el area legal (Sioux Carrera). Temas: contratos, legalidad.
- equipo: reunion interna general que no encaja en los anteriores.
Elegi el subtipo segun los participantes y los temas tratados.

EQUIPO KOREX: Matias Braszka (COO), Cristian Fernandez (socio), Jose Martin (CMO), David Castaneda (Trafficker), Marcos del Rey (CTO), Zil, Maria, Christian Uscanga, Jose Zerillo, Sioux Carrera (Legal), Mikel Zabala (Q/A).

REGLAS:
- titulo: corto y especifico, NO genericos de la plataforma
- equipo_subtipo: null si la categoria NO es equipo ni mentoria
- feedback: solo si lo dijeron explicito, sino array vacio
- objeciones: solo si categoria=ventas
- problemas_detectados: priorizar en cliente
- responsable default: Matias

CLIENTES ACTIVOS:
${clientesText}

TRANSCRIPT:
${transcript.slice(0, 80000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  let text = data?.content?.[0]?.text ?? "";
  // Limpiar markdown si vino
  text = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  // Buscar primer { y ultimo }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Normaliza el subtipo de equipo a uno de los valores validos (o null).
function normSubtipo(categoria: string, raw: unknown): string | null {
  if (categoria !== "equipo" && categoria !== "mentoria") return null;
  const v = String(raw ?? "").toLowerCase().trim();
  const valid = ["marketing", "socios", "programacion", "abogada", "equipo"];
  if (valid.includes(v)) return v;
  // tolerar acentos / variantes
  if (v.startsWith("program")) return "programacion";
  if (v.startsWith("abog") || v.includes("legal")) return "abogada";
  if (v.startsWith("market")) return "marketing";
  if (v.startsWith("soci")) return "socios";
  return "equipo";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return j(200, { ok: true });

  try {
    if (!ANTHROPIC_API_KEY) {
      return j(500, { error: "ANTHROPIC_API_KEY no configurada en el edge function" });
    }

    // 1. Leer pendientes (max MAX_PER_RUN)
    const { data: pending, error: pErr } = await supabase
      .from("llamadas_inbox")
      .select("id, fathom_id, received_at, title_fathom, transcript, recording_url, raw_payload")
      .eq("processed", false)
      .order("received_at", { ascending: true })
      .limit(MAX_PER_RUN);

    if (pErr) return j(500, { error: pErr.message });
    if (!pending || pending.length === 0) {
      return j(200, { processed: 0, errors: 0, remaining: 0, message: "No hay llamadas pendientes" });
    }

    // 2. Cargar clientes activos
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, company")
      .eq("status", "active");

    const clientesText = (clients || [])
      .map((c: any) => `- ${c.name}${c.company ? ` (${c.company})` : ""} [id: ${c.id}]`)
      .join("\n");

    // 3. Procesar una por una
    let processed = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const inb of pending) {
      try {
        if (!inb.transcript) {
          await supabase.from("llamadas_inbox")
            .update({ processing_error: "sin_transcript" })
            .eq("id", inb.id);
          errors++;
          continue;
        }

        // Anti-duplicado
        const { data: dup } = await supabase
          .from("llamadas")
          .select("id")
          .eq("recording_url", inb.recording_url)
          .maybeSingle();
        if (dup) {
          await supabase.from("llamadas_inbox")
            .update({ processed: true, processed_at: new Date().toISOString() })
            .eq("id", inb.id);
          continue;
        }

        // Sacar fecha real de Fathom
        const recStart = (inb.raw_payload as any)?.webhook?.recording_start_time
          ?? (inb.raw_payload as any)?.recording_start_time
          ?? null;

        // Llamar a Claude
        const result = await callClaude(inb.transcript, clientesText, recStart);
        if (!result) {
          await supabase.from("llamadas_inbox")
            .update({ processing_error: "claude_no_json" })
            .eq("id", inb.id);
          errors++;
          errorDetails.push(`${inb.fathom_id}: claude no devolvio JSON valido`);
          continue;
        }

        // Match cliente
        let clienteId: string | null = null;
        let confidence = "sin_match";
        const mencionado = (result.cliente_mencionado as string) || "";
        if (mencionado && clients) {
          const norm = mencionado.toLowerCase().trim();
          const exact = (clients as any[]).find(c =>
            c.name?.toLowerCase().trim() === norm ||
            c.company?.toLowerCase().trim() === norm
          );
          if (exact) {
            clienteId = exact.id;
            confidence = "exacto";
          } else {
            const partial = (clients as any[]).find(c =>
              (c.name && norm.includes(c.name.toLowerCase().trim().split(" ")[0])) ||
              (c.company && norm.includes(c.company.toLowerCase().trim().split(" ")[0]))
            );
            if (partial) {
              clienteId = partial.id;
              confidence = "inferido";
            }
          }
        }

        const categoria = (result.categoria as string) || "equipo";
        const equipoSubtipo = normSubtipo(categoria, result.equipo_subtipo);

        // Insertar llamada
        const llmId = generateLlmId();
        const { error: insErr } = await supabase.from("llamadas").insert({
          id: llmId,
          inbox_id: inb.id,
          categoria,
          equipo_subtipo: equipoSubtipo,
          titulo: (result.titulo as string || inb.title_fathom || "Sin titulo").slice(0, 200),
          cliente_id: clienteId,
          cliente_match_confidence: confidence,
          participantes: result.participantes || [],
          fecha: recStart || new Date().toISOString(),
          duracion_min: result.duracion_min || null,
          recording_url: inb.recording_url,
          resumen: result.resumen || "",
          proximos_pasos: result.proximos_pasos || [],
          feedback: result.feedback || [],
          problemas_detectados: result.problemas_detectados || [],
          objeciones: result.objeciones || [],
          notas_clave: result.notas_clave || "",
        });

        if (insErr) {
          await supabase.from("llamadas_inbox")
            .update({ processing_error: insErr.message.slice(0, 200) })
            .eq("id", inb.id);
          errors++;
          errorDetails.push(`${inb.fathom_id}: ${insErr.message}`);
          continue;
        }

        // Marcar como procesada
        await supabase.from("llamadas_inbox")
          .update({ processed: true, processed_at: new Date().toISOString(), processing_error: null })
          .eq("id", inb.id);
        processed++;
      } catch (e: any) {
        await supabase.from("llamadas_inbox")
          .update({ processing_error: String(e?.message || e).slice(0, 200) })
          .eq("id", inb.id);
        errors++;
        errorDetails.push(`${inb.fathom_id}: ${String(e?.message || e)}`);
      }
    }

    // Contar restantes
    const { count } = await supabase
      .from("llamadas_inbox")
      .select("id", { count: "exact", head: true })
      .eq("processed", false);

    return j(200, {
      processed,
      errors,
      remaining: count ?? 0,
      errorDetails: errorDetails.slice(0, 5),
    });
  } catch (e: any) {
    return j(500, { error: String(e?.message || e) });
  }
});

// supabase/functions/wa-clasificar-clientes/index.ts
// Cascada de clasificación automática (R0-R5) para vincular conversaciones a clientes.
//
// Modos:
//   inspect → reporte de qué haría cada regla (cuántas conversaciones toca, ejemplos)
//   apply   → ejecuta las reglas y escribe client_id, tipo_conversacion, etc. (con confirm!==true = dry-run)
//
// Reglas (en orden, solo aplica la PRIMERA que matchea):
//   R0: telefono_9 de conv = team_members.whatsapp  → tipo_conversacion='equipo_interno'
//   R1: telefono_9 = clients.phone  → tipo_conversacion='lider', client_id
//   R2: telefono_9 aparece en wa_identidades vinculado a cliente conocido
//   R3: nombre del grupo contiene clients.{name,company,team_name,korex_code}
//   R4: contacts.linked_client_id por coincidencia de 9 dígitos
//   R5: sin resolver → no escribe nada
//
// Cada regla solo escribe si bloqueado_manual is not true.
// verify_jwt: true

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

function tel9(phone: string | null): string {
  if (!phone) return "";
  const digits = (phone || "").replace(/\D/g, "");
  return digits.slice(-9);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* */ }

  const mode = ["apply"].includes(body.mode) ? body.mode : "inspect";
  const confirm = body.confirm === true;

  try {
    // ── Cargar datos de referencia ──
    const [
      { data: convs },
      { data: teamMembers },
      { data: clients },
      { data: identidades },
      { data: contacts },
    ] = await Promise.all([
      supabase.from("wa_conversations").select(
        "id, wa_jid, wa_phone, is_group, wa_profile_name, client_id, bloqueado_manual, contact_id"
      ),
      supabase.from("team_members").select("id, whatsapp"),
      supabase.from("clients").select("id, name, phone, company, team_name, korex_code"),
      supabase.from("wa_identidades").select("telefono_9, client_id"),
      supabase.from("contacts").select("id, phone, linked_client_id"),
    ]);

    // ── Construir mapas para búsqueda rápida ──
    const teamPhones = new Set<string>(
      (teamMembers || []).map(tm => tel9(tm.whatsapp)).filter(t => t)
    );

    const clientsByPhone = new Map<string, string>();
    const clientsByName = new Map<string, string>();
    const clientsByCode = new Map<string, string>();
    for (const cl of clients || []) {
      if (cl.phone) clientsByPhone.set(tel9(cl.phone), cl.id);
      if (cl.name) clientsByName.set(cl.name.toLowerCase(), cl.id);
      if (cl.company) clientsByName.set(cl.company.toLowerCase(), cl.id);
      if (cl.team_name) clientsByName.set(cl.team_name.toLowerCase(), cl.id);
      if (cl.korex_code) clientsByCode.set(cl.korex_code, cl.id);
    }

    const identidadesByPhone = new Map<string, string>();
    for (const id of identidades || []) {
      if (id.telefono_9 && id.client_id) {
        identidadesByPhone.set(id.telefono_9, id.client_id);
      }
    }

    const contactsByPhone = new Map<string, string>();
    for (const ct of contacts || []) {
      if (ct.phone && ct.linked_client_id) {
        contactsByPhone.set(tel9(ct.phone), ct.linked_client_id);
      }
    }

    // ── Clasificar cada conversación ──
    type RuleMatch = {
      conv_id: string;
      wa_jid: string;
      wa_phone: string | null;
      is_group: boolean;
      name: string;
      rule: string;
      client_id: string | null;
      tipo_conversacion: string | null;
      confidence: string;
    };

    const matches: RuleMatch[] = [];

    for (const conv of convs || []) {
      if (conv.client_id || conv.bloqueado_manual) continue; // ya tiene cliente o está bloqueado

      const phone = conv.wa_phone || "";
      const phone9 = tel9(phone);
      const name = conv.wa_profile_name || conv.wa_jid || "";

      // R0: interno
      if (!conv.is_group && teamPhones.has(phone9)) {
        matches.push({
          conv_id: conv.id,
          wa_jid: conv.wa_jid,
          wa_phone: phone,
          is_group: conv.is_group,
          name,
          rule: "R0:equipo_interno",
          client_id: null,
          tipo_conversacion: "equipo_interno",
          confidence: "alta",
        });
        continue;
      }

      // R1: cliente directo
      if (!conv.is_group && clientsByPhone.has(phone9)) {
        const clientId = clientsByPhone.get(phone9)!;
        matches.push({
          conv_id: conv.id,
          wa_jid: conv.wa_jid,
          wa_phone: phone,
          is_group: conv.is_group,
          name,
          rule: "R1:cliente_directo",
          client_id: clientId,
          tipo_conversacion: "lider",
          confidence: "alta",
        });
        continue;
      }

      // R2: via wa_identidades (para grupos principalmente)
      if (phone9 && identidadesByPhone.has(phone9)) {
        const clientId = identidadesByPhone.get(phone9)!;
        matches.push({
          conv_id: conv.id,
          wa_jid: conv.wa_jid,
          wa_phone: phone,
          is_group: conv.is_group,
          name,
          rule: "R2:identidades",
          client_id: clientId,
          tipo_conversacion: null,
          confidence: "media",
        });
        continue;
      }

      // R3: nombre de grupo contiene nombre/codigo de cliente
      if (conv.is_group) {
        const nameLower = name.toLowerCase();
        let matchedClient: string | null = null;
        for (const [searchName, clientId] of clientsByName.entries()) {
          if (nameLower.includes(searchName)) {
            matchedClient = clientId;
            break;
          }
        }
        if (!matchedClient) {
          for (const [code, clientId] of clientsByCode.entries()) {
            if (nameLower.includes(code.toLowerCase())) {
              matchedClient = clientId;
              break;
            }
          }
        }
        if (matchedClient) {
          matches.push({
            conv_id: conv.id,
            wa_jid: conv.wa_jid,
            wa_phone: phone,
            is_group: conv.is_group,
            name,
            rule: "R3:nombre_grupo",
            client_id: matchedClient,
            tipo_conversacion: null,
            confidence: "baja",
          });
          continue;
        }
      }

      // R4: contacto con linked_client_id
      if (!conv.is_group && phone9 && contactsByPhone.has(phone9)) {
        const clientId = contactsByPhone.get(phone9)!;
        matches.push({
          conv_id: conv.id,
          wa_jid: conv.wa_jid,
          wa_phone: phone,
          is_group: conv.is_group,
          name,
          rule: "R4:contacto_linked",
          client_id: clientId,
          tipo_conversacion: null,
          confidence: "media",
        });
        continue;
      }

      // R5: sin resolver (no escribimos nada)
    }

    // ── Modo inspect: solo reporta ──
    if (mode === "inspect") {
      const byRule: Record<string, RuleMatch[]> = {};
      for (const m of matches) {
        if (!byRule[m.rule]) byRule[m.rule] = [];
        byRule[m.rule].push(m);
      }

      return jsonResp(200, {
        ok: true,
        mode: "inspect",
        total_convs: convs?.length ?? 0,
        total_unresolved: (convs || []).filter(c => !c.client_id && !c.bloqueado_manual).length,
        total_would_match: matches.length,
        by_rule: Object.fromEntries(
          Object.entries(byRule).map(([rule, items]) => [
            rule,
            {
              count: items.length,
              examples: items.slice(0, 3),
            },
          ])
        ),
        matches,
      });
    }

    // ── Modo apply: escribe en la DB ──
    if (mode === "apply") {
      if (!confirm) {
        return jsonResp(200, {
          ok: true,
          mode: "apply",
          preview: true,
          total_would_update: matches.length,
          by_rule: Object.fromEntries(
            matches.reduce((acc: Record<string, number>, m) => {
              acc[m.rule] = (acc[m.rule] || 0) + 1;
              return acc;
            }, {})
          ),
          message: "Pass confirm:true to execute. This is a dry-run.",
        });
      }

      // Aplicar los cambios
      let updated = 0;
      let errors = 0;

      for (const match of matches) {
        const patch: Record<string, any> = {
          client_id: match.client_id,
          client_id_source: match.rule,
          client_id_confidence: match.confidence,
        };
        if (match.tipo_conversacion) {
          patch.tipo_conversacion = match.tipo_conversacion;
        }

        const { error } = await supabase
          .from("wa_conversations")
          .update(patch)
          .eq("id", match.conv_id)
          .eq("bloqueado_manual", false) // safety: no overwrite if locked
          .is("client_id", null); // safety: no overwrite if already has client

        if (error) {
          console.error(`wa-clasificar-clientes: update failed for conv ${match.conv_id}`, error);
          errors++;
        } else {
          updated++;
        }
      }

      return jsonResp(200, {
        ok: true,
        mode: "apply",
        confirm: true,
        total_matched: matches.length,
        total_updated: updated,
        total_errors: errors,
        by_rule: Object.fromEntries(
          matches.reduce((acc: Record<string, number>, m) => {
            acc[m.rule] = (acc[m.rule] || 0) + 1;
            return acc;
          }, {})
        ),
      });
    }

    return jsonResp(400, { error: "invalid_mode" });
  } catch (e) {
    console.error("wa-clasificar-clientes:", e);
    return jsonResp(500, { error: String(e).slice(0, 500) });
  }
});

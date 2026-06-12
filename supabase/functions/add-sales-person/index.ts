// supabase/functions/add-sales-person/index.ts
// Agrega conectores/closers nuevos a la lista `sales_people` cuando el closer carga
// uno que no estaba en el formulario. Valida la misma passphrase del form.
// Es una lista SEPARADA de Contactos y de los usuarios del sistema (sin acceso al panel).
//
// verify_jwt: false (auth por passphrase).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FORM_SECRET = Deno.env.get("VENTA_FORM_SECRET") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  // Passphrase: env var o app_settings(key='venta_form_config').secret.
  let expected = FORM_SECRET;
  if (!expected) {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "venta_form_config")
        .maybeSingle();
      expected = String((data?.value as Record<string, unknown> | undefined)?.secret ?? "");
    } catch (_e) { /* ignore */ }
  }
  if (!expected || String(body.passphrase ?? "") !== expected) {
    return json(401, { error: "unauthorized" });
  }

  // Nombres a agregar (dedup, sin vacíos). Inserta los que no existan.
  const raw = Array.isArray(body.names) ? body.names : [body.names];
  const names = Array.from(
    new Set(raw.map((n) => String(n ?? "").trim()).filter(Boolean)),
  );
  if (!names.length) return json(200, { ok: true, added: 0 });

  try {
    const { error } = await supabase
      .from("sales_people")
      .upsert(names.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
    if (error) {
      console.error("add-sales-person: error upsert", error);
      return json(500, { error: error.message });
    }
  } catch (e) {
    console.error("add-sales-person: fallo", e);
    return json(500, { error: String(e) });
  }

  return json(200, { ok: true, names });
});

// supabase/functions/form-config/index.ts
// Config PÚBLICA del formulario de venta (solo lo que el form necesita mostrar
// antes de enviar). NO expone secretos. Devuelve:
//   - whatsapp_request_msg: el mensaje 1 (pedir datos por WhatsApp).
//   - sales_people: lista de conectores/closers (para los buscadores del form).
//
// verify_jwt: false (es de lectura pública, sin datos sensibles).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let whatsappMsg = "";
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "global")
      .maybeSingle();
    const cfg = (data?.value as Record<string, unknown> | undefined)?.onboarding_config as
      | Record<string, unknown>
      | undefined;
    whatsappMsg = typeof cfg?.whatsapp_request_msg === "string" ? cfg.whatsapp_request_msg : "";
  } catch (e) {
    console.error("form-config: error leyendo config", e);
  }

  let salesPeople: string[] = [];
  try {
    const { data } = await supabase
      .from("sales_people")
      .select("name")
      .order("name");
    salesPeople = (data ?? []).map((r: { name: string }) => r.name);
  } catch (e) {
    console.error("form-config: error leyendo sales_people", e);
  }

  return new Response(
    JSON.stringify({ whatsapp_request_msg: whatsappMsg, sales_people: salesPeople }),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
});

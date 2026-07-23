// supabase/functions/bunny-admin/index.ts
// Proxy de administración de Bunny Stream, para operar la biblioteca DESDE el servidor
// (la IP de Supabase, no la del que corre el script). Se usa para verificar el estado real
// de los videos migrados y re-bajar del Drive los que fallaron.
//
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>.
// Acciones (POST JSON):
//   { action: 'list_all' }                          → [{guid,status,length,storageSize,title}] (todas las páginas)
//   { action: 'refetch', guid, url, token }         → re-dispara la bajada del Drive a ese video
// status Bunny: 0 creado · 1 subido · 2 procesando · 3 transcodificando · 4 listo · 5 error · 6 falló-subida

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BK = Deno.env.get("BUNNY_API_KEY") ?? "";
const LIB = Deno.env.get("BUNNY_LIBRARY_ID") ?? "";
const DETECT_TOKEN = Deno.env.get("DETECT_TOKEN") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const V = "https://video.bunnycdn.com/library";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!((DETECT_TOKEN && auth === DETECT_TOKEN) || (SERVICE_ROLE && auth === SERVICE_ROLE)))
      return json({ ok: false, error: "no autorizado" }, 401);

    const body = await req.json();
    const H = { AccessKey: BK, accept: "application/json" };

    if (body.action === "list_all") {
      const out: unknown[] = [];
      let page = 1;
      for (;;) {
        const r = await fetch(`${V}/${LIB}/videos?page=${page}&itemsPerPage=100&orderBy=date`, { headers: H });
        if (!r.ok) return json({ ok: false, error: `bunny_${r.status}: ${(await r.text()).slice(0, 120)}` }, 502);
        const d = await r.json();
        for (const v of (d.items || [])) out.push({ guid: v.guid, status: v.status, length: v.length, storageSize: v.storageSize, title: v.title });
        if (!d.items?.length || out.length >= (d.totalItems || 0)) break;
        page++; await sleep(250);
      }
      return json({ ok: true, videos: out });
    }

    if (body.action === "refetch") {
      const { guid, url, token } = body;
      if (!guid || !url) return json({ ok: false, error: "faltan guid/url" }, 400);
      const r = await fetch(`${V}/${LIB}/videos/${guid}/fetch`, {
        method: "POST",
        headers: { ...H, "content-type": "application/json" },
        body: JSON.stringify({ url, headers: token ? { Authorization: "Bearer " + token } : {} }),
      });
      const d = await r.json().catch(() => ({}));
      return json({ ok: !!d.success, status: r.status, detail: d });
    }

    return json({ ok: false, error: "acción desconocida" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});

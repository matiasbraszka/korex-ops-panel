// supabase/functions/bunny-video/index.ts
// Puente con Bunny Stream para subir video pesado directo desde el navegador.
//
// El navegador NO puede tener la API key de Bunny (se filtraría). Así que:
//   1) el panel pide acá "creá un video con este título";
//   2) esta función crea el video en la biblioteca de Bunny (con la key, del lado servidor)
//      y devuelve una FIRMA temporal (TUS) para que el navegador suba el archivo directo a
//      Bunny — sin que el archivo pase por acá (aguanta cualquier tamaño) y sin exponer la key.
//
// Secrets (supabase secrets set): BUNNY_API_KEY · BUNNY_LIBRARY_ID · BUNNY_HOSTNAME
// Firma TUS de Bunny: sha256( libraryId + apiKey + expiration + videoId )

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const BUNNY_KEY = Deno.env.get("BUNNY_API_KEY") ?? "";
const BUNNY_LIB = Deno.env.get("BUNNY_LIBRARY_ID") ?? "";
const BUNNY_HOST = Deno.env.get("BUNNY_HOSTNAME") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function isAuthed(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || (ANON_KEY && token === ANON_KEY)) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!BUNNY_KEY || !BUNNY_LIB) return j({ ok: false, error: "bunny_not_configured" }, 500);
  if (!(await isAuthed(req))) return j({ ok: false, error: "unauthorized" }, 401);

  let title = "video", action = "create", videoId = "";
  try {
    const b = await req.json() as Record<string, unknown>;
    title = String(b?.title ?? "video").slice(0, 200);
    action = String(b?.action ?? "create");
    videoId = String(b?.videoId ?? "");
  } catch { /* sin body */ }

  // Crear un video vacío en Bunny y firmar la subida directa (TUS).
  if (action === "create") {
    const cr = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos`, {
      method: "POST",
      headers: { AccessKey: BUNNY_KEY, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!cr.ok) return j({ ok: false, error: "bunny_create_failed", detail: await cr.text() }, 502);
    const vid = await cr.json() as Record<string, unknown>;
    const guid = String(vid?.guid ?? "");
    if (!guid) return j({ ok: false, error: "bunny_no_guid" }, 502);
    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hora para subir
    const signature = await sha256hex(`${BUNNY_LIB}${BUNNY_KEY}${expiration}${guid}`);
    return j({
      ok: true, videoId: guid, libraryId: Number(BUNNY_LIB), hostname: BUNNY_HOST,
      expiration, signature, tusEndpoint: "https://video.bunnycdn.com/tusupload",
      embedUrl: `https://iframe.mediadelivery.net/embed/${BUNNY_LIB}/${guid}`,
    });
  }

  // Borrar un video de Bunny (cuando se borra el recurso en el panel).
  if (action === "delete") {
    if (!videoId) return j({ ok: false, error: "missing_video_id" }, 400);
    const dr = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos/${videoId}`, {
      method: "DELETE", headers: { AccessKey: BUNNY_KEY, accept: "application/json" },
    });
    return j({ ok: dr.ok }, dr.ok ? 200 : 502);
  }

  return j({ ok: false, error: "bad_action" }, 400);
});

// supabase/functions/staff-onboarding/index.ts
// Backend del formulario público de onboarding del equipo (/onboarding).
// La persona que entra a Korex carga sus datos y dos fotos (perfil + documento).
// Guardamos las fotos en el bucket privado staff-docs y la respuesta en la
// tabla de staging staff_onboarding; un admin la convierte después en ficha.
//
// verify_jwt: false — formulario público. Usa service role para escribir sin
// exponer las tablas/bucket (que son admin-only por RLS).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = "staff-docs";
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB por foto

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

// Quita caracteres de control (no imprimibles) y recorta.
function clean(s: unknown, max = 300): string {
  return Array.from(String(s ?? ""))
    .filter((c) => c.charCodeAt(0) >= 32)
    .join("")
    .trim()
    .slice(0, max);
}

// Slug ASCII de un nombre (saca acentos y caracteres raros).
function slug(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

// Convierte un dataURL/base64 en bytes. Acepta "data:mime;base64,xxxx" o crudo.
function decodeBase64(input: string): { bytes: Uint8Array; mime: string } | null {
  try {
    let mime = "application/octet-stream";
    let b64 = input;
    const m = input.match(/^data:([^;]+);base64,(.*)$/s);
    if (m) { mime = m[1]; b64 = m[2]; }
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  } catch {
    return null;
  }
}

function extFromMime(mime: string, fallback = "bin"): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
  };
  return map[mime.toLowerCase()] || fallback;
}

// Sube una foto (data URL) al bucket privado. Devuelve el path o null.
async function uploadPhoto(folder: string, kind: string, dataUrl: unknown): Promise<string | null> {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const decoded = decodeBase64(dataUrl);
  if (!decoded) return null;
  if (decoded.bytes.byteLength > MAX_FILE_BYTES) throw new Error("file_too_large");
  const path = `onboarding/${folder}/${kind}.${extFromMime(decoded.mime)}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, decoded.bytes, {
    contentType: decoded.mime,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const name = clean(b.name, 120);
  if (name.length < 2) return json(400, { error: "bad_name" });

  // Fecha de nacimiento (opcional) validada como YYYY-MM-DD.
  const birth = clean(b.birth_date, 10);
  const birth_date = /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : null;

  // Carpeta de las fotos: hora + slug del nombre.
  const folder = `${Date.now()}-${slug(name) || "persona"}`;

  let profile_photo_path: string | null = null;
  let document_photo_path: string | null = null;
  try {
    profile_photo_path = await uploadPhoto(folder, "perfil", b.profile_photo);
    document_photo_path = await uploadPhoto(folder, "documento", b.document_photo);
  } catch (e) {
    if (String((e as Error)?.message) === "file_too_large") {
      return json(413, { error: "file_too_large" });
    }
    console.error("staff-onboarding: error subiendo fotos", e);
    return json(500, { error: "upload_failed" });
  }

  const row = {
    status: "pending",
    name,
    role: clean(b.role, 80) || null,
    gender: clean(b.gender, 40) || null,
    document_number: clean(b.document_number, 60) || null,
    document_photo_path,
    profile_photo_path,
    birth_date,
    address_street: clean(b.address_street, 200) || null,
    address_city: clean(b.address_city, 120) || null,
    address_zip: clean(b.address_zip, 40) || null,
    address_state: clean(b.address_state, 120) || null,
    address_country: clean(b.address_country, 120) || null,
    whatsapp: clean(b.whatsapp, 40) || null,
    personal_email: clean(b.personal_email, 160) || null,
    emergency_contact: clean(b.emergency_contact, 300) || null,
    payment_info: clean(b.payment_info, 500) || null,
  };

  const { error } = await admin.from("staff_onboarding").insert(row);
  if (error) {
    console.error("staff-onboarding: error insertando", error);
    return json(500, { error: "db_error" });
  }

  return json(200, { ok: true });
});

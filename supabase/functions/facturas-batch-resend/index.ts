// DESACTIVADA. Funcion temporal para reenviar por lote facturas sin email/Drive (bug 403).
// Cumplido su uso (0462-0467). Inerte. Borrar del dashboard cuando se pueda.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({ ok:false, error:"gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));

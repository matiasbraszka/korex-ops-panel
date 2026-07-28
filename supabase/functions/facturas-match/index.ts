// DESACTIVADA. Funcion temporal que vinculo las 370 facturas historicas a sus ingresos.
// Inerte. Reactivar (redeploy) solo si se hace la 2da pasada de las 55 sin match. Borrar luego.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({ ok:false, error:"gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));

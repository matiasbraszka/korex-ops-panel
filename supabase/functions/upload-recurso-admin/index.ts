// DESHABILITADA. Usos puntuales ya cumplidos (branding Korex, QA temporal 2026-07-28).
Deno.serve(() => new Response(JSON.stringify({ ok: false, error: 'deshabilitada' }), { status: 410 }));

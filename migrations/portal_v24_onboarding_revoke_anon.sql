-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v24 — ONBOARDING: cerrar el acceso anónimo a las funciones
-- Aplicada a prod el 2026-07-25 vía MCP y verificada con `set role anon`.
--
-- Postgres concede EXECUTE a PUBLIC por defecto, y `grant execute to
-- authenticated` NO lo revoca. Como todas estas funciones son SECURITY DEFINER,
-- quedaban invocables SIN SESIÓN. Dos de ellas eran agujeros reales:
--
--   _onboarding_run(client_id)          → cualquiera podía CREAR runs para
--                                         cualquier cliente (escritura).
--   onboarding_assemble_text(client_id) → cualquiera podía leer el onboarding
--                                         COMPLETO de cualquier cliente.
--
-- Las portal_onboarding_* estaban protegidas de hecho (arrancan con
-- portal_cliente_client(), que devuelve null sin sesión), pero igual se cierran:
-- depender de una guarda interna cuando el permiso alcanza es fragilidad
-- gratuita.
--
-- NOTA: el resto de las RPC portal_cliente_* del portal tienen exactamente el
-- mismo problema desde v9 (lo confirma el advisor de Supabase:
-- "anon_security_definer_function_executable"). No se tocan acá para no mezclar
-- cambios, pero conviene hacer la misma pasada con ellas.
-- ═════════════════════════════════════════════════════════════════════════════

-- Helpers internos: solo los llaman otras funciones security definer (que corren
-- como el owner) y la edge function onboarding-invitar (service_role).
revoke execute on function
  public._onboarding_run(text),
  public._onboarding_visible(text, jsonb),
  public._onboarding_refrescar(text),
  public.onboarding_progreso(text),
  public.onboarding_assemble_text(text)
from public, anon, authenticated;

grant execute on function
  public._onboarding_run(text),
  public.onboarding_assemble_text(text),
  public.onboarding_progreso(text)
to service_role;

-- Cara al cliente logueado: authenticated sí, anónimo no.
revoke execute on function
  public.portal_onboarding_catalogo(),
  public.portal_onboarding_estado(),
  public.portal_onboarding_guardar(text, text, jsonb, text, text, text, text, int, timestamptz),
  public.portal_onboarding_guardar_lote(jsonb),
  public.portal_onboarding_seccion_completa(text),
  public.portal_onboarding_agenda_datos(),
  public.portal_onboarding_agenda_registrar(uuid),
  public.portal_onboarding_agenda_omitir(text),
  public.portal_onboarding_completar()
from public, anon;

-- Cara al equipo: tienen guarda interna (is_team_member / service_role), pero
-- tampoco hay razón para que anon pueda ni intentarlo.
revoke execute on function
  public.onboarding_admin_estado(text),
  public.onboarding_vincular(text, text),
  public.onboarding_writeback(text, boolean)
from public, anon;

grant execute on function
  public.onboarding_vincular(text, text),
  public.onboarding_writeback(text, boolean)
to service_role;

notify pgrst, 'reload schema';

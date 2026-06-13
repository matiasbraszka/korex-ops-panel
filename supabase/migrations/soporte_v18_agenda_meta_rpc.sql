-- Metadatos públicos mínimos de un calendario de agenda (solo nombre y
-- descripción, que ya se muestran en la página pública /agendar) para que la
-- función de servidor /api/agendar pueda armar el <title> y las etiquetas
-- Open Graph del link. SECURITY DEFINER: lee saltando RLS pero expone SOLO
-- esos dos campos de calendarios activos, sin abrir el resto de la tabla.
create or replace function public.agenda_calendar_meta(p_slug text default null)
returns table(name text, description text)
language sql
stable
security definer
set search_path = public
as $$
  select name, description
  from booking_calendars
  where active = true and (p_slug is null or slug = p_slug)
  order by created_at asc
  limit 1
$$;

revoke all on function public.agenda_calendar_meta(text) from public;
grant execute on function public.agenda_calendar_meta(text) to anon, authenticated;

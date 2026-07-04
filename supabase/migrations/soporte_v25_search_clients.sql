-- soporte_v25_search_clients.sql
-- Busqueda de clientes para el modulo soporte (clients es modulo operations;
-- soporte no puede leerla directo por RLS). Se usa para vincular grupos de
-- WhatsApp a un cliente desde el panel.

create or replace function public.soporte_search_clients(p_q text)
returns table(id text, name text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name
  from clients c
  where has_permission('soporte', '*', 'read')
    and c.name ilike '%' || p_q || '%'
  order by c.name
  limit 15;
$$;
revoke all on function public.soporte_search_clients(text) from public;
grant execute on function public.soporte_search_clients(text) to authenticated;

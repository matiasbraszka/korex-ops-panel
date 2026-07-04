-- soporte_v24_fin_linking.sql
-- Vincula conversaciones de WhatsApp con el Directorio de Finanzas
-- (fin_directory) por telefono/nombre, deriva el cliente y puentea al CRM
-- (contacts) para reusar contact_id/client_id ya cableados en la bandeja.
--
-- fin_people esta vacia y fin_directory no tiene client_id: el cliente se
-- deriva por nombre normalizado (fin_norm) contra clients.name / cliente_padre,
-- con fallback a fin_client_terms. El telefono de fin_directory es texto sucio
-- de planilla: se compara por sufijo de 8 digitos (solo numeros).

-- (a) Busqueda de personas del Directorio para el modal del panel (browser).
create or replace function public.soporte_search_fin_people(p_q text)
returns table(directory_id uuid, nombre text, tipo text, telefono text,
              email text, client_id text, client_name text)
language sql stable security definer set search_path = public as $$
  with q as (
    select fin_norm(p_q) as nq,
           right(regexp_replace(coalesce(p_q,''), '[^0-9]', '', 'g'), 8) as dq
  )
  select d.id, d.nombre, d.tipo, d.telefono, d.email, cl.id, cl.name
  from fin_directory d
  cross join q
  left join lateral (
    select c.id, c.name from clients c
    where fin_norm(c.name) = fin_norm(d.cliente_padre)
    limit 1
  ) cl on true
  where has_permission('soporte', '*', 'read')
    and q.nq <> ''
    and ( fin_norm(d.nombre) like '%' || q.nq || '%'
       or fin_norm(coalesce(d.email, '')) like '%' || q.nq || '%'
       or ( length(q.dq) >= 6
            and regexp_replace(coalesce(d.telefono, ''), '[^0-9]', '', 'g') like '%' || q.dq ) )
  order by (fin_norm(d.nombre) = q.nq) desc, (cl.id is not null) desc, d.nombre
  limit 15;
$$;
revoke all on function public.soporte_search_fin_people(text) from public;
grant execute on function public.soporte_search_fin_people(text) to authenticated;

-- (b) Resolucion + puente CRM. Nucleo compartido: webhook (service_role, por
-- telefono) y panel (via edge function, por directory_id elegido a mano).
create or replace function public.soporte_resolve_fin(
  p_wa_phone text,
  p_directory_id uuid default null
) returns table(matched boolean, directory_id uuid, contact_id uuid,
                client_id text, client_name text, name text, phone text)
language plpgsql security definer set search_path = public as $$
declare
  v_dir     fin_directory%rowtype;
  v_cid     text;
  v_cname   text;
  v_contact uuid;
  v_phone   text := nullif(regexp_replace(coalesce(p_wa_phone, ''), '[^0-9]', '', 'g'), '');
begin
  if p_directory_id is not null then
    select * into v_dir from fin_directory where id = p_directory_id;
  elsif v_phone is not null and length(v_phone) >= 8 then
    select d.* into v_dir from fin_directory d
    where regexp_replace(coalesce(d.telefono, ''), '[^0-9]', '', 'g') like '%' || right(v_phone, 8)
    order by (lower(d.tipo) = 'cliente') desc, d.created_at desc nulls last
    limit 1;
  end if;

  if v_dir.id is null then
    return query select false, null::uuid, null::uuid, null::text, null::text, null::text, v_phone;
    return;
  end if;

  -- Derivar cliente por nombre normalizado (cascada).
  select c.id, c.name into v_cid, v_cname
  from clients c where fin_norm(c.name) = fin_norm(v_dir.cliente_padre) limit 1;
  if v_cid is null then
    select t.client_id into v_cid from fin_client_terms t
    where t.client_id is not null
      and ( fin_norm(t.sheet_client_name) = fin_norm(v_dir.cliente_padre)
         or fin_norm(t.sheet_client_name) = fin_norm(v_dir.cliente) )
    limit 1;
    if v_cid is not null then
      select name into v_cname from clients where id = v_cid;
    end if;
  end if;

  -- Puente CRM: guardamos el telefono de WhatsApp (solo digitos) para que el
  -- match por telefono siga funcionando; el nombre es el del Directorio.
  v_contact := public.match_or_create_contact(
    v_dir.nombre, v_phone, v_dir.email, null, 'whatsapp_fin', null);

  if v_cid is not null then
    update public.contacts set linked_client_id = v_cid, updated_at = now()
    where id = v_contact and coalesce(linked_client_id, '') <> v_cid;
  end if;

  return query select true, v_dir.id, v_contact, v_cid, v_cname, v_dir.nombre, v_phone;
end;
$$;
revoke all on function public.soporte_resolve_fin(text, uuid) from public;
grant execute on function public.soporte_resolve_fin(text, uuid) to service_role;

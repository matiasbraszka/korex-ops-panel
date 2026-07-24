-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v9 — PEDIDOS estandarizados + EVENTOS del cliente + Slack
-- (Fases A y B del plan "Portal v2"). Aplicada a prod el 2026-07-24 vía MCP.
--
--  A) portal_pedidos: LA entidad "pedido al cliente" (título, cantidad objetivo,
--     fecha de pedido, bloqueante, estado). Reemplaza a los 3 mecanismos
--     dormidos (pending_resources / visual_resources / bottleneck) para el
--     portal. Plantilla estándar en app_settings + seed al activar el portal.
--  B) portal_eventos: registro de TODO lo que hace el cliente + aviso por
--     SLACK al canal del cliente (clients.slack_channel_id) vía la edge
--     function portal-slack-notify (pg_net, no bloqueante, con anti-spam).
-- ═════════════════════════════════════════════════════════════════════════════

-- ── A.1 · Tabla de pedidos ───────────────────────────────────────────────────
create table if not exists public.portal_pedidos (
  id text primary key default ('pp_'||replace(gen_random_uuid()::text,'-','')),
  client_id text not null references public.clients(id) on delete cascade,
  strategy_id text,                          -- null = pedido general del cliente
  tipo text not null default 'otro',         -- fotos | logo | acceso_meta | otro
  titulo text not null,
  descripcion text default '',
  bucket_key text,                           -- carpeta donde caen los archivos (autoridad, branding…)
  target_count int,                          -- ej. 5 fotos; null = sin objetivo numérico
  bloqueante boolean not null default false, -- "Nos está frenando"
  estado text not null default 'pendiente',  -- pendiente | cliente_dice_listo | completo | validado
  pedido_at timestamptz not null default now(),
  completado_at timestamptz,
  created_by text,
  orden int not null default 0,
  activo boolean not null default true
);
create index if not exists portal_pedidos_client_idx on public.portal_pedidos (client_id) where activo;

alter table public.portal_pedidos enable row level security;
drop policy if exists portal_pedidos_team on public.portal_pedidos;
create policy portal_pedidos_team on public.portal_pedidos
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
grant select, insert, update, delete on public.portal_pedidos to authenticated;

-- ── A.2 · Config y plantilla estándar ────────────────────────────────────────
-- portal_config: número de socio de Meta (pantalla "Acceso a Meta"), WhatsApp
-- del equipo (línea de ayuda del portal) y el secret del aviso por Slack.
insert into public.app_settings (key, value)
values ('portal_config', jsonb_build_object(
  'meta_partner_id', '',
  'whatsapp_equipo', '',
  'slack_notify_secret', replace(gen_random_uuid()::text,'-','')
))
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values ('portal_pedidos_template', jsonb_build_array(
  jsonb_build_object('tipo','fotos','titulo','Sube 5 fotos tuyas',
    'descripcion','Las usamos en la portada de tus videos y en tu página. Con fotos del celular alcanza.',
    'bucket_key','autoridad','target_count',5,'bloqueante',false,'orden',2),
  jsonb_build_object('tipo','logo','titulo','Tu logo y tus colores',
    'descripcion','Para que todo lo que publiquemos salga con tu identidad.',
    'bucket_key','branding','target_count',null,'bloqueante',false,'orden',3),
  jsonb_build_object('tipo','acceso_meta','titulo','Danos acceso a Meta',
    'descripcion','Sin esto no podemos publicar tus anuncios. Te dejamos el paso a paso con capturas.',
    'bucket_key',null,'target_count',null,'bloqueante',true,'orden',4)
))
on conflict (key) do nothing;

-- ── A.3 · Seed de pedidos estándar (idempotente por tipo) ────────────────────
create or replace function public.portal_pedidos_seed(p_client text)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_item jsonb;
begin
  if not exists (select 1 from public.clients where id = p_client) then return; end if;
  for v_item in
    select * from jsonb_array_elements(coalesce(
      (select value from public.app_settings where key = 'portal_pedidos_template'), '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.portal_pedidos
      where client_id = p_client and tipo = v_item->>'tipo' and activo
    ) then
      insert into public.portal_pedidos (client_id, tipo, titulo, descripcion, bucket_key, target_count, bloqueante, orden, created_by)
      values (p_client, v_item->>'tipo', v_item->>'titulo', coalesce(v_item->>'descripcion',''),
              nullif(v_item->>'bucket_key',''), nullif(v_item->>'target_count','')::int,
              coalesce((v_item->>'bloqueante')::boolean,false), coalesce((v_item->>'orden')::int,0), 'seed');
    end if;
  end loop;
end $$;

-- Enganchar el seed a la activación del portal (misma función de siempre + seed).
create or replace function public.portal_admin_activar(p_client_id text, p_email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_person uuid; v_cli record; v_email text;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  select id, name, email into v_cli from public.clients where id = p_client_id;
  if v_cli.id is null then return jsonb_build_object('ok', false, 'error', 'cliente no encontrado'); end if;

  v_person := public._portal_person_de_cliente(p_client_id);
  v_email := lower(btrim(coalesce(nullif(p_email, ''), v_cli.email, '')));

  if v_person is null then
    if v_email = '' or v_email not like '%_@_%.__%' then
      return jsonb_build_object('ok', false, 'error', 'falta_email',
        'detail', 'El cliente no tiene email cargado. Pasá un email para crearle el acceso.');
    end if;
    insert into public.fin_directory (nombre, email, tipo)
    values (v_cli.name, v_email, 'Cliente')
    returning id into v_person;
  else
    if (select coalesce(email,'') from public.fin_directory where id = v_person) = '' then
      if v_email = '' or v_email not like '%_@_%.__%' then
        return jsonb_build_object('ok', false, 'error', 'falta_email',
          'detail', 'Su ficha del directorio no tiene email. Pasá un email para crearle el acceso.');
      end if;
      update public.fin_directory set email = v_email where id = v_person;
    end if;
    if not exists (select 1 from public.portal_access where person_id = v_person) then
      perform public.portal_provision_account(v_person);
    end if;
  end if;

  -- v9: al activar el portal se crean los pedidos estándar (fotos, logo, Meta).
  perform public.portal_pedidos_seed(p_client_id);

  return public.portal_admin_estado(p_client_id);
end $$;

-- ── B.1 · Eventos del cliente ────────────────────────────────────────────────
create table if not exists public.portal_eventos (
  id bigint generated always as identity primary key,
  client_id text not null,
  tipo text not null,            -- subida | guion_grabado | pedido_completo | acceso_meta_listo | comentario
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  visto_por_equipo boolean not null default false
);
create index if not exists portal_eventos_client_idx on public.portal_eventos (client_id, created_at desc);

alter table public.portal_eventos enable row level security;
drop policy if exists portal_eventos_team on public.portal_eventos;
create policy portal_eventos_team on public.portal_eventos
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
grant select, update on public.portal_eventos to authenticated;

-- ── B.2 · Aviso por Slack (no bloqueante, tolerante a fallas) ────────────────
-- Postea al canal del cliente vía la edge function portal-slack-notify.
-- pg_net encola el POST: si Slack está caído, la RPC del portal no se entera.
create or replace function public._portal_slack(p_client text, p_texto text)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_secret text;
begin
  select value->>'slack_notify_secret' into v_secret
  from public.app_settings where key = 'portal_config';
  if coalesce(v_secret,'') = '' then return; end if;
  perform net.http_post(
    url := 'https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/portal-slack-notify',
    headers := jsonb_build_object('Content-Type','application/json','x-portal-secret', v_secret),
    body := jsonb_build_object('client_id', p_client, 'texto', p_texto),
    timeout_milliseconds := 8000
  );
exception when others then null;  -- avisar nunca puede romper la acción del cliente
end $$;

-- Anti-spam: ¿hubo un evento de este tipo para este cliente hace poco?
create or replace function public._portal_evento_reciente(p_client text, p_tipo text, p_min int default 10)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.portal_eventos
    where client_id = p_client and tipo = p_tipo
      and created_at > now() - make_interval(mins => p_min)
  );
$$;

-- ── B.3 · registrar_recurso v9: igual que v5 + evento + Slack ────────────────
create or replace function public.portal_cliente_registrar_recurso(
  p_folder text, p_provider text, p_kind text, p_title text,
  p_storage_path text, p_public_url text, p_bunny_id text,
  p_mime text, p_size bigint,
  p_strategy text default null, p_avatar text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_cid text; v_id text;
  v_bucket text; v_strategy text := null; v_avatar text := null;
  v_avisar boolean; v_nombre text; v_funnel text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;

  if p_strategy is not null and exists (
    select 1 from public.strategies s where s.id = p_strategy and s.client_id = v_cid
  ) then v_strategy := p_strategy; end if;

  if p_folder = 'vsl_rec' and v_strategy is not null then
    v_bucket := 'vsl_rec';
  elsif p_folder like 'ad_rec__%' and v_strategy is not null then
    v_bucket := 'ad_rec'; v_avatar := substring(p_folder from 9);
  elsif p_folder = 'testimonios' and v_strategy is not null then
    v_bucket := 'testimonios';
  else
    v_strategy := null;
    v_bucket := case p_folder when 'estilo' then 'estilo_vida'
                              when 'grab-anuncios' then 'sin_clasif'
                              when 'grab-vsl' then 'sin_clasif'
                              else coalesce(nullif(p_folder,''), 'sin_clasif') end;
  end if;

  v_id := 'fr_'||replace(gen_random_uuid()::text,'-','');
  insert into public.funnel_resources(id, client_id, strategy_id, avatar_id, version, kind, title,
     provider, bunny_id, storage_path, public_url, mime_type, size_bytes, bucket_key, created_by, created_at)
  values (v_id, v_cid, v_strategy, v_avatar, 1, coalesce(p_kind,'file'), p_title,
     p_provider, p_bunny_id, p_storage_path, p_public_url, p_mime, p_size, v_bucket, 'portal_cliente', now());

  -- v9: evento + aviso Slack (uno por ráfaga: si subió algo hace <10 min, no repetimos)
  v_avisar := not public._portal_evento_reciente(v_cid, 'subida', 10);
  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'subida', jsonb_build_object('folder', p_folder, 'bucket', v_bucket,
          'strategy', v_strategy, 'title', p_title, 'kind', p_kind));
  if v_avisar then
    select name into v_nombre from public.clients where id = v_cid;
    select name into v_funnel from public.strategies where id = v_strategy;
    perform public._portal_slack(v_cid, '📤 *'||coalesce(v_nombre,'Cliente')||'* está subiendo material desde el portal'
      || case when v_funnel is not null then ' → '||v_funnel else '' end
      || ' (carpeta '||v_bucket||').');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'bucket', v_bucket);
end $$;

-- ── B.4 · toggle_guion v9: igual que antes + evento + Slack al marcar grabado ─
create or replace function public.portal_cliente_toggle_guion(p_section_id text, p_grabado boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_cid text; v_titulo text; v_nombre text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok',false); end if;
  select title into v_titulo from public.del_sections where id = p_section_id and client_id = v_cid;
  if v_titulo is null then return jsonb_build_object('ok',false); end if;
  insert into public.portal_guion_status(client_id, section_id, grabado, grabado_at, updated_at)
  values (v_cid, p_section_id, coalesce(p_grabado,false), case when p_grabado then now() end, now())
  on conflict (client_id, section_id) do update
    set grabado=excluded.grabado, grabado_at=excluded.grabado_at, updated_at=now();

  if coalesce(p_grabado,false) then
    if not public._portal_evento_reciente(v_cid, 'guion_grabado', 10) then
      select name into v_nombre from public.clients where id = v_cid;
      perform public._portal_slack(v_cid, '🎬 *'||coalesce(v_nombre,'Cliente')||'* marcó grabado: '||v_titulo);
    end if;
    insert into public.portal_eventos (client_id, tipo, payload)
    values (v_cid, 'guion_grabado', jsonb_build_object('section_id', p_section_id, 'titulo', v_titulo));
  end if;

  return jsonb_build_object('ok',true,'grabado',coalesce(p_grabado,false));
end $$;

-- ── B.5 · "Ya te di el acceso" (pantalla Acceso a Meta) ──────────────────────
create or replace function public.portal_cliente_marcar_acceso_meta()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_cid text; v_nombre text; v_n int;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false); end if;
  update public.portal_pedidos
     set estado = 'cliente_dice_listo'
   where client_id = v_cid and tipo = 'acceso_meta' and activo and estado = 'pendiente';
  get diagnostics v_n = row_count;
  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'acceso_meta_listo', jsonb_build_object('pedidos', v_n));
  select name into v_nombre from public.clients where id = v_cid;
  perform public._portal_slack(v_cid, '✅ *'||coalesce(v_nombre,'Cliente')||'* dice que YA dio acceso a Meta — hay que validarlo.');
  return jsonb_build_object('ok', true);
end $$;

grant execute on function
  public.portal_pedidos_seed(text),
  public.portal_cliente_marcar_acceso_meta()
to authenticated;

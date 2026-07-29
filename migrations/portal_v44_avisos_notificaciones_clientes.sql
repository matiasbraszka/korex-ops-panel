-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v44_avisos_notificaciones_clientes.sql
--
-- Los avisos de lo que hace el cliente pasan a un canal único de Slack
-- (#notificaciones-clientes) y con el detalle completo: fecha y hora, cliente,
-- qué hizo exactamente, de qué embudo, y desde cuándo se lo veníamos pidiendo.
--
-- El destino lo cambia la edge function `portal-slack-notify` (una línea), así
-- que acá solo se arreglan los TEXTOS y se saca el freno.
--
-- EL FRENO: los tres avisos usaban `_portal_evento_reciente(cid, tipo, 10)`, que
-- manda uno y se calla los siguientes diez minutos. Tenía sentido cuando el
-- aviso caía en el canal privado del cliente y lo iba a leer él. En un canal
-- dedicado a notificaciones, agrupar significa perderse 19 de cada 20 subidas.
-- Se saca.
--
-- Y se agrega un aviso que no existía: cuando una petición de material llega al
-- mínimo que se le pidió. Es el único momento en que el equipo puede dejar de
-- esperar y ponerse a trabajar con ese material.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Encabezado común: fecha, hora (AR) y nombre del cliente.
create or replace function public._portal_aviso_cab(p_client text)
returns text
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select '[' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || '] *'
      || coalesce((select c.name from public.clients c where c.id = p_client), 'Cliente') || '*';
$$;

-- El nombre legible de una carpeta. El mismo rótulo que ve el equipo en el panel.
create or replace function public._portal_carpeta_label(p_bucket text)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select case p_bucket
    when 'autoridad'        then 'Fotos de autoridad'
    when 'estilo_vida'      then 'Fotos de estilo de vida'
    when 'branding'         then 'Branding (logo y colores)'
    when 'productos'        then 'Fotos de productos'
    when 'empresa'          then 'Material de la empresa'
    when 'testimonios'      then 'Testimonios'
    when 'testimonios_korex' then 'Testimonios Korex'
    when 'vsl_rec'          then 'VSL · grabación'
    when 'vsl_edit'         then 'VSL · edición'
    when 'ad_rec'           then 'Anuncios · grabación'
    when 'ad_edit'          then 'Anuncios · edición'
    when 'stock'            then 'Stock / B-roll'
    when 'instagram'        then 'Imágenes de Instagram'
    when 'imagenes_diseno'  then 'Imágenes para diseño'
    when 'sin_clasif'       then 'Sin clasificar'
    else coalesce(nullif(p_bucket, ''), 'una carpeta') end;
$$;

-- El nombre del embudo, para colgarlo del aviso.
create or replace function public._portal_embudo_nombre(p_strategy text)
returns text
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select sp.name from public.strategy_pages sp
   where p_strategy is not null and sp.strategy_id = p_strategy
   order by sp.position, sp.id limit 1;
$$;

-- ── Comentarios ─────────────────────────────────────────────────────────────
create or replace function public.portal_cliente_comentar(p_section_id text, p_body text, p_quote text default null, p_parent_id text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_cid text; v_name text; v_sec record; v_id text; v_emb text; v_txt text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null or btrim(coalesce(p_body,'')) = '' then return jsonb_build_object('ok', false); end if;
  select id, doc_id, strategy_id, title into v_sec
  from public.del_sections where id = p_section_id and client_id = v_cid;
  if v_sec.id is null then return jsonb_build_object('ok', false); end if;
  select name into v_name from public.clients where id = v_cid;
  v_emb := public._portal_embudo_nombre(v_sec.strategy_id);

  v_id := 'dc_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.del_comments (id, section_id, doc_id, strategy_id, author_id, author_name, body, quote, parent_id, portal_client_id, resolved, created_at)
  values (v_id, p_section_id, v_sec.doc_id, v_sec.strategy_id, null, coalesce(v_name,'Cliente'),
          btrim(p_body), nullif(btrim(coalesce(p_quote,'')),''), nullif(p_parent_id,''), v_cid, false, now());

  -- El comentario entero, no los primeros 120 caracteres: el aviso tiene que
  -- servir para responder sin abrir el documento.
  v_txt := public._portal_aviso_cab(v_cid) || ' · 💬 comentó en *' || coalesce(v_sec.title, 'un documento') || '*'
        || coalesce(' · embudo ' || v_emb, '')
        || case when btrim(coalesce(p_quote,'')) <> ''
                then E'\n> ' || left(btrim(p_quote), 200) else '' end
        || E'\n' || left(btrim(p_body), 600);
  perform public._portal_slack(v_cid, v_txt);

  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'comentario', jsonb_build_object('section_id', p_section_id, 'titulo', v_sec.title,
          'embudo', v_emb, 'body', left(btrim(p_body), 600)));

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ── Guion marcado como grabado ──────────────────────────────────────────────
create or replace function public.portal_cliente_toggle_guion(p_section_id text, p_grabado boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_cid text; v_sec record; v_nombre text; v_emb text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok',false); end if;
  select title, strategy_id into v_sec from public.del_sections where id = p_section_id and client_id = v_cid;
  if v_sec.title is null then return jsonb_build_object('ok',false); end if;

  insert into public.portal_guion_status(client_id, section_id, grabado, grabado_at, updated_at)
  values (v_cid, p_section_id, coalesce(p_grabado,false), case when p_grabado then now() end, now())
  on conflict (client_id, section_id) do update
    set grabado=excluded.grabado, grabado_at=excluded.grabado_at, updated_at=now();

  if coalesce(p_grabado,false) then
    v_emb := public._portal_embudo_nombre(v_sec.strategy_id);
    perform public._portal_slack(v_cid,
      public._portal_aviso_cab(v_cid) || ' · 🎬 marcó como grabado *' || v_sec.title || '*'
      || coalesce(' · embudo ' || v_emb, ''));
    insert into public.portal_eventos (client_id, tipo, payload)
    values (v_cid, 'guion_grabado', jsonb_build_object('section_id', p_section_id, 'titulo', v_sec.title, 'embudo', v_emb));
  end if;

  return jsonb_build_object('ok',true,'grabado',coalesce(p_grabado,false));
end $$;

-- ── Material subido ─────────────────────────────────────────────────────────
create or replace function public.portal_cliente_registrar_recurso(
  p_folder text, p_provider text, p_kind text, p_title text, p_storage_path text,
  p_public_url text, p_bunny_id text, p_mime text, p_size bigint,
  p_strategy text default null, p_avatar text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_id text;
  v_bucket text; v_strategy text := null; v_avatar text := null;
  v_nombre text; v_emb text; v_ped record; v_n int;
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

  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'subida', jsonb_build_object('folder', p_folder, 'bucket', v_bucket,
          'strategy', v_strategy, 'title', p_title, 'kind', p_kind));

  -- La petición correspondiente, si la hay: de ahí sale "pedido el DD/MM".
  select pp.id, pp.titulo, pp.target_count, pp.pedido_at into v_ped
    from public.portal_pedidos pp
   where pp.client_id = v_cid and pp.activo and pp.bucket_key = v_bucket
     and ((pp.strategy_id is null and v_strategy is null) or pp.strategy_id = v_strategy)
   limit 1;

  v_emb := public._portal_embudo_nombre(v_strategy);

  -- Un aviso por archivo, sin agrupar: el canal es de notificaciones y lo que
  -- importa es saber QUÉ entró.
  perform public._portal_slack(v_cid,
    public._portal_aviso_cab(v_cid) || ' · 📤 subió *' || coalesce(nullif(btrim(p_title),''), 'un archivo')
    || '* a *' || public._portal_carpeta_label(v_bucket) || '*'
    || coalesce(' · embudo ' || v_emb, '')
    || case when v_ped.pedido_at is not null
            then ' · pedido el ' || to_char(v_ped.pedido_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM')
            else '' end);

  -- ¿Con este archivo se completó lo que le pedimos? Ese es el momento en que el
  -- equipo puede dejar de esperar y ponerse a trabajar.
  if v_ped.target_count is not null then
    select count(*) into v_n from public.funnel_resources fr
     where fr.client_id = v_cid and fr.bucket_key = v_bucket
       and ((v_strategy is null and fr.strategy_id is null) or fr.strategy_id = v_strategy);
    if v_n = v_ped.target_count then
      perform public._portal_slack(v_cid,
        public._portal_aviso_cab(v_cid) || ' · ✅ completó *' || v_ped.titulo || '* ('
        || v_ped.target_count || ' de ' || v_ped.target_count || ')'
        || coalesce(' · embudo ' || v_emb, '')
        || ' · pedido el ' || to_char(v_ped.pedido_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM'));
      insert into public.portal_eventos (client_id, tipo, payload)
      values (v_cid, 'pedido_completo', jsonb_build_object('pedido', v_ped.id, 'titulo', v_ped.titulo,
              'bucket', v_bucket, 'embudo', v_emb));
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'bucket', v_bucket);
end $$;

commit;

notify pgrst, 'reload schema';

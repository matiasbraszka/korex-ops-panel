-- marketing_vsl_corpus_v1 — corpus de entrenamiento del agente de guiones VSL.
--
-- El agente de VSL reusa la MISMA mecanica de "busqueda inteligente" que el de Anuncios
-- (scoring por palabras clave en agent-chat, sin embeddings): metadatos de todas las filas
-- -> top 3 por score -> segunda query que trae el content solo de esas. Por eso reusa la
-- tabla marketing_ad_library con valores nuevos de `part` en vez de una tabla propia: el
-- scorer es generico salvo por ese filtro.
--
-- Valores de `part` (no hay CHECK: la columna es texto libre):
--   anuncios ->  blueprint | blueprint_section | example
--   vsl      ->  vsl_blueprint | vsl_section | vsl_ficha | vsl_guion
--
-- Capas del material de VSL:
--   vsl_blueprint : 1 fila. Partes 0-2 del Blueprint v4.0 (nucleo invariable + esqueleto de
--                   10 secciones + flujo de recuperacion). Va SIEMPRE, en la capa cacheada.
--   vsl_section   : 12 filas. Partes 3-11 troceadas a mano. Los modulos de nicho (6.1-6.4)
--                   son filas separadas: son la pieza de mayor valor por consulta.
--   vsl_ficha     : 28 filas, una por VSL de la biblioteca. Metadatos + avatar (dolor/deseo)
--                   + promesa/angulo/mecanismo/cierre + estructura beat a beat + copy.
--   vsl_guion     : 29 filas (28 + el 2do guion del VSL 24). El guion textual completo.
--
-- Por que ficha y guion van separados: un ejemplo de anuncio pesa ~2,5 KB, asi que mandar 3
-- enteros sale barato. Un VSL pesa ~15,8 KB de media: top-3 completos serian ~47 KB (~13k
-- tokens) sin cachear en CADA turno. El propio blueprint manda "buscar el caso mas cercano
-- -> clonar su estructura", asi que el agente recibe top-3 FICHAS + el guion completo del
-- mejor caso solamente (~25 KB). Mas barato y mas fiel al metodo.
--
-- metrics (jsonb) de ficha/guion — el cruce con Voomly, que es lo que distingue a este
-- corpus del de anuncios:
--   {vsl_id, cliente, tipo, duracion_min, palabras, completo,
--    voomly_name, embed_id, uniq_plays, play_rate, engagement, p25, p50, p75, p100,
--    score, tier, otros_videos[], flags[]}
--
--   score = 0.40*p50 + 0.35*p100 + 0.25*engagement
--   tier  = ganador >= 44 | medio 30-44 | perdedor < 30 | sin_datos si uniq_plays < 50
--
--   OJO, diferencia deliberada con meta-ads-sync: alli el score es min-max RELATIVO al lote
--   de anuncios de una cuenta (compiten por el mismo publico). Aca no sirve: compararia el
--   VSL de Piquer contra el de Monica Vozmediano. La retencion (p50/p100/engagement) es
--   intrinseca al video, asi que es comparable entre nichos que no compiten entre si.
--   Umbrales en app_settings.vsl_winners_config para ajustarlos sin deploy.

-- 1) La tabla ya existe en la DB viva pero NO estaba en ninguna migracion (se creo por MCP).
--    Se deja documentada aca para que el esquema sea reproducible.
create table if not exists public.marketing_ad_library (
  id           text primary key,
  part         text not null,
  niche        text,
  niche_tags   text[] default '{}'::text[],
  avatar       text,
  title        text,
  content      text not null,
  char_count   integer,
  position     integer default 0,
  created_at   timestamptz default now(),
  status       text not null default 'approved',
  client_id    text,
  metrics      jsonb,
  source_ad_id text
);

alter table public.marketing_ad_library enable row level security;

-- 2) Indices para el scorer: la primera fase filtra por part y trae solo metadatos.
create index if not exists marketing_ad_library_part_status_idx
  on public.marketing_ad_library (part, status);
create index if not exists marketing_ad_library_niche_tags_idx
  on public.marketing_ad_library using gin (niche_tags);

-- 3) Umbrales de "VSL ganador", editables sin deploy.
insert into public.app_settings (key, value)
values ('vsl_winners_config', jsonb_build_object(
  'min_uniq_plays', 50,
  'umbral_ganador', 44,
  'umbral_perdedor', 30,
  'pesos', jsonb_build_object('p50', 0.40, 'p100', 0.35, 'engagement', 0.25)
))
on conflict (key) do nothing;

-- 4) Ingesta del corpus desde el script de carga local (scripts/vsl-corpus-load.mjs).
--
-- Mismo patron que vsl_voomly_ingest: SECURITY DEFINER + secret, porque desde el
-- endurecimiento de RLS del 17/06 anon ya no escribe directo, y el corpus se genera fuera
-- del panel (parseando los .docx del Blueprint y de los Ejemplos). Reusa el MISMO secret
-- que la ingesta de Voomly (app_settings.vsl_ingest_secret), que ya vive en el .env de
-- voomly-export como VSL_INGEST_SECRET.
create or replace function public.marketing_corpus_ingest(p_secret text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_secret text;
  v_count  int;
begin
  select value->>'secret' into v_secret from public.app_settings where key='vsl_ingest_secret';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'secreto invalido';
  end if;

  insert into public.marketing_ad_library as t
    (id, part, niche, niche_tags, avatar, title, content, char_count, position,
     client_id, metrics, status)
  select id, part, niche, niche_tags, avatar, title, content,
         coalesce(char_count, length(content)), coalesce(position, 0),
         client_id, metrics, coalesce(status, 'approved')
  from jsonb_populate_recordset(null::public.marketing_ad_library, p_rows)
  where id is not null and content is not null
  on conflict (id) do update set
    part=excluded.part, niche=excluded.niche, niche_tags=excluded.niche_tags,
    avatar=excluded.avatar, title=excluded.title, content=excluded.content,
    char_count=excluded.char_count, position=excluded.position,
    client_id=excluded.client_id, metrics=excluded.metrics, status=excluded.status;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.marketing_corpus_ingest(text, jsonb) from public, anon, authenticated;
grant execute on function public.marketing_corpus_ingest(text, jsonb) to anon, authenticated;

-- 5) Verificacion post-carga. Hace falta un RPC propio porque el SELECT directo con la
-- anon key lo corta RLS y PostREST devuelve [] con HTTP 200 — o sea, "todo mal" y "todo
-- bien" se ven igual. Devuelve solo id + md5, nunca el contenido.
create or replace function public.marketing_corpus_checksums(p_secret text, p_parts text[])
returns table (id text, md5 text, char_count integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_secret text;
begin
  select value->>'secret' into v_secret from public.app_settings where key='vsl_ingest_secret';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'secreto invalido';
  end if;

  return query
    select t.id, md5(t.content), t.char_count
    from public.marketing_ad_library t
    where t.part = any(p_parts);
end;
$function$;

revoke all on function public.marketing_corpus_checksums(text, text[]) from public, anon, authenticated;
grant execute on function public.marketing_corpus_checksums(text, text[]) to anon, authenticated;

-- 6) Instrucciones del especialista desde el script de carga.
-- Las instrucciones se editan normalmente desde el panel (Marketing › Configuración), pero
-- las de VSL se versionan como archivo porque son largas y se escriben junto al corpus.
-- Devuelve el md5 de lo que quedó guardado para poder verificar que llegó intacto.
create or replace function public.marketing_subagent_set_instructions(p_secret text, p_key text, p_instructions text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_secret text;
  v_md5    text;
begin
  select value->>'secret' into v_secret from public.app_settings where key='vsl_ingest_secret';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'secreto invalido';
  end if;

  update public.marketing_subagents
     set instructions = p_instructions, updated_at = now()
   where key = p_key;

  if not found then raise exception 'no existe el subagente %', p_key; end if;

  select md5(instructions) into v_md5 from public.marketing_subagents where key = p_key;
  return v_md5;
end;
$function$;

revoke all on function public.marketing_subagent_set_instructions(text, text, text) from public, anon, authenticated;
grant execute on function public.marketing_subagent_set_instructions(text, text, text) to anon, authenticated;

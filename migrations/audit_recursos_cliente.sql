-- Auditoría de recursos por funnel (creada 2026-07-28, aplicada vía MCP execute_sql).
-- Para cada video con transcripción de un cliente, compara la transcripción contra
-- las secciones del DEL de CADA funnel del cliente (pg_trgm word_similarity) y
-- devuelve solo los que matchean mejor con OTRO funnel que el que los contiene.
-- Uso: select * from audit_recursos_cliente('c_...');
-- Regla práctica: mover solo si s1 >= 0.45 y s1 - s2 >= 0.1; los empates se
-- resuelven MIRANDO la miniatura de Bunny (https://vz-09607d67-e1f.b-cdn.net/<bunny_id>/thumbnail.jpg)
-- porque dos funnels pueden compartir guion y solo cambia quién está en cámara.
create or replace function audit_recursos_cliente(p_client text)
returns table(video_id text, video text, bucket text, funnel_actual text, funnel_mejor text, s1 numeric, s2 numeric)
language sql stable as $$
with vids as (
  select fr.id, fr.title, fr.bucket_key, fr.strategy_id as actual,
         lower(left(fr.transcript, 2500)) as tr
  from funnel_resources fr
  where fr.client_id = p_client and coalesce(fr.transcript,'') <> ''
    and (fr.bucket_key like 'vsl_%' or fr.bucket_key like 'ad_%')
),
funnels as (
  select sp.strategy_id, sp.name, sp.del_doc_id from strategy_pages sp where sp.client_id = p_client
),
secs as (
  select f.strategy_id, lower(left(ds.text, 5000)) as txt
  from funnels f join del_sections ds on ds.doc_id = f.del_doc_id
  where length(ds.text) > 400
),
scores as (
  select v.id, v.title, v.bucket_key, v.actual, s.strategy_id as candidato,
         max(greatest(word_similarity(v.tr, s.txt), word_similarity(s.txt, v.tr))) as score
  from vids v cross join secs s
  group by v.id, v.title, v.bucket_key, v.actual, s.strategy_id
),
rank2 as (
  select id, title, bucket_key, actual,
         (array_agg(candidato order by score desc))[1] as mejor,
         round((array_agg(score order by score desc))[1]::numeric,3) as s1,
         round(coalesce((array_agg(score order by score desc))[2],0)::numeric,3) as s2
  from scores group by id, title, bucket_key, actual
)
select r.id, r.title, r.bucket_key, fa.name, fm.name, r.s1, r.s2
from rank2 r
join funnels fa on fa.strategy_id = r.actual
join funnels fm on fm.strategy_id = r.mejor
where r.actual <> r.mejor
$$;

-- vsl_voomly_v1 — métricas de los videos de Voomly traídas por el exportador
-- (voomly-export/pull.mjs). 1 fila por video, upsert por voomly_id. Aditiva.
-- Rollback:  DROP TABLE IF EXISTS public.vsl_voomly;
CREATE TABLE IF NOT EXISTS public.vsl_voomly (
  voomly_id   text PRIMARY KEY,                 -- uuid del video en Voomly
  name        text,                             -- nombre del archivo/video
  kind        text,                             -- 'VSL' | 'Testimonio' | 'Otro'
  total_plays int  NOT NULL DEFAULT 0,
  uniq_plays  int  NOT NULL DEFAULT 0,
  total_views int  NOT NULL DEFAULT 0,
  uniq_views  int  NOT NULL DEFAULT 0,
  play_rate   numeric,                          -- %
  engagement  numeric,                          -- % promedio visto (watch time)
  retention   jsonb,                            -- { points:{p0..p100}, curve:[...] }
  uploaded_at timestamptz,                      -- fecha de subida a Voomly
  synced_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vsl_voomly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on vsl_voomly" ON public.vsl_voomly;
CREATE POLICY "Allow all on vsl_voomly" ON public.vsl_voomly FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.vsl_voomly TO anon, authenticated, service_role;

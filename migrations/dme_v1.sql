-- dme_v1: panel de metricas diario por cliente (DME).
-- Una fila por (client_id, date). Solo se guardan los INPUTS crudos en una bolsa
-- jsonb keyed por metric_key; los derivados (TOTAL, %, CPL, ROI, AVG, dispersion,
-- runway...) se calculan en el frontend (apps/operations/src/lib/dme/*) y NUNCA se
-- guardan. "Agregar una metrica" = editar el registry JS, sin tocar este schema.
--
-- Acceso: el equipo de Operaciones lee/escribe (has_permission('operations',...),
-- ya existente, SECURITY DEFINER, con shortcut de admin). El agregado multi-cliente
-- "Todos combinados" se gatea SOLO para admin via el RPC dme_combined_daily (abajo)
-- + se oculta en la UI.

CREATE TABLE IF NOT EXISTS public.dme_daily (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date       date NOT NULL,
  -- Bolsa de inputs crudos: { "<metric_key>": <number>, ... }. El orden/labels/
  -- kind/derivacion viven en el registry JS, no aca.
  metrics    jsonb NOT NULL DEFAULT '{}'::jsonb,
  note       text,
  updated_by text REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, date)
);

CREATE INDEX IF NOT EXISTS dme_daily_client_date_idx ON public.dme_daily (client_id, date);
CREATE INDEX IF NOT EXISTS dme_daily_date_idx        ON public.dme_daily (date DESC);

ALTER TABLE public.dme_daily ENABLE ROW LEVEL SECURITY;

-- Lectura: equipo de operaciones (o admin via el shortcut del helper).
DROP POLICY IF EXISTS dme_daily_read ON public.dme_daily;
CREATE POLICY dme_daily_read ON public.dme_daily FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('operations', '*', 'read')));

-- Escritura: equipo de operaciones (o admin).
DROP POLICY IF EXISTS dme_daily_write ON public.dme_daily;
CREATE POLICY dme_daily_write ON public.dme_daily FOR ALL TO authenticated
  USING      ((SELECT public.has_permission('operations', '*', 'write')))
  WITH CHECK ((SELECT public.has_permission('operations', '*', 'write')));

-- updated_at automatico.
CREATE OR REPLACE FUNCTION public.dme_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS dme_daily_touch ON public.dme_daily;
CREATE TRIGGER dme_daily_touch BEFORE UPDATE ON public.dme_daily
  FOR EACH ROW EXECUTE FUNCTION public.dme_touch_updated_at();

-- ── Agregado multi-cliente "Todos combinados" (SOLO admin/Matias) ──
-- Devuelve, por fecha, la suma elemento-a-elemento de los bags de inputs de TODOS
-- los clientes en el rango. Los snapshots (saldos, usuarios activos) se SUMAN entre
-- clientes para dar el total del sistema Korex (igual que el Maestro del Sheet); la
-- agregacion en el tiempo (semana/mes) la resuelve el frontend (ultimo valor para
-- snapshots). Solo numericos: se filtran valores no-numericos del bag.
CREATE OR REPLACE FUNCTION public.dme_combined_daily(p_from date, p_to date)
RETURNS TABLE (date date, metrics jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden ver el combinado DME';
  END IF;

  RETURN QUERY
  WITH per_key AS (
    SELECT d.date AS dt, e.key AS k, SUM((e.value)::numeric) AS total
    FROM public.dme_daily d
    CROSS JOIN LATERAL jsonb_each_text(d.metrics) AS e(key, value)
    WHERE d.date BETWEEN p_from AND p_to
      AND e.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    GROUP BY d.date, e.key
  )
  SELECT pk.dt, jsonb_object_agg(pk.k, pk.total)
  FROM per_key pk
  GROUP BY pk.dt
  ORDER BY pk.dt;
END; $$;

-- anon NO debe poder llamarla (la funcion ya se autoprotege con is_admin(), pero
-- ademas se revoca a PUBLIC/anon para no exponerla por PostgREST).
REVOKE ALL ON FUNCTION public.dme_combined_daily(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dme_combined_daily(date, date) TO authenticated;

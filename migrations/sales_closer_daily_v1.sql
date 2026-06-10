-- sales_closer_daily v1
-- Scorecard diario de actividad por closer. Una fila por (closer_id, date).
-- Solo se cargan los conteos/montos del dia; las tasas (% agendamiento,
-- % show up, % calificacion, % oferta, % cierre, ticket) se derivan en el
-- frontend (apps/sales/src/lib/closerKpis.js). RLS copiada del patron de
-- sales_targets: lee el equipo de ventas, escribe cada uno lo propio (+ admin).

CREATE TABLE IF NOT EXISTS public.sales_closer_daily (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_id   uuid NOT NULL,
  date        date NOT NULL,
  -- Prospeccion
  seguimientos               integer NOT NULL DEFAULT 0,
  contactos_contactados      integer NOT NULL DEFAULT 0,
  leads_vieron_contenido     integer NOT NULL DEFAULT 0,
  calendlys_enviados         integer NOT NULL DEFAULT 0,
  llamadas_agendadas         integer NOT NULL DEFAULT 0,
  -- Llamadas del dia
  llamadas_calendario_inicio integer NOT NULL DEFAULT 0,
  llamadas_tuve              integer NOT NULL DEFAULT 0,
  llamadas_calificadas       integer NOT NULL DEFAULT 0,
  llamadas_no_asistieron     integer NOT NULL DEFAULT 0,
  ofertas                    integer NOT NULL DEFAULT 0,
  -- Cierre
  depositos                  integer NOT NULL DEFAULT 0,
  ventas                     integer NOT NULL DEFAULT 0,
  facturacion                numeric NOT NULL DEFAULT 0,
  new_upfront_cash           numeric NOT NULL DEFAULT 0,
  -- Metadata
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closer_id, date)
);

ALTER TABLE public.sales_closer_daily ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier integrante del equipo de ventas o admin (para ver al equipo).
DROP POLICY IF EXISTS sales_closer_daily_read ON public.sales_closer_daily;
CREATE POLICY sales_closer_daily_read ON public.sales_closer_daily FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['sales','admin'])
  ));

-- Escritura: cada closer carga su propia fila; los admin pueden cargar cualquiera.
DROP POLICY IF EXISTS sales_closer_daily_write ON public.sales_closer_daily;
CREATE POLICY sales_closer_daily_write ON public.sales_closer_daily FOR ALL
  USING (
    closer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
  WITH CHECK (
    closer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS sales_closer_daily_closer_idx ON public.sales_closer_daily(closer_id);
CREATE INDEX IF NOT EXISTS sales_closer_daily_date_idx   ON public.sales_closer_daily(date DESC);

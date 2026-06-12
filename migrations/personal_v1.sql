-- personal_v1: pestaña "Personal" en Administración.
--
-- Ficha HR de cada miembro del equipo (fechas, salarios), historial de pagos
-- mensuales con factura adjunta y contratos enviados con vencimiento.
-- Todo construido sobre team_members (no se duplica gente).
--
-- Seguridad: salarios y documentos son sensibles → RLS admin-only en las 3
-- tablas y policies admin-only en el bucket privado staff-docs. A diferencia
-- de wa-media, acá el frontend sube/lee archivos directo, por eso el bucket
-- sí lleva policies.

-- 1) Ficha HR (1 a 1 con team_members)
CREATE TABLE IF NOT EXISTS public.staff_hr (
  member_id text PRIMARY KEY REFERENCES public.team_members(id) ON DELETE CASCADE,
  birth_date date,
  start_date date,            -- fecha de ingreso a Korex
  promised_salary numeric,    -- salario mensual prometido
  hourly_rate numeric,        -- salario por hora
  currency text DEFAULT 'USD',
  notes text,
  updated_at timestamptz DEFAULT now()
);

-- 2) Historial de pagos (un registro por mes pagado)
CREATE TABLE IF NOT EXISTS public.staff_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  period date NOT NULL,       -- 1° del mes que se paga
  amount numeric NOT NULL,
  currency text DEFAULT 'USD',
  paid_at date,
  invoice_path text,          -- factura adjunta en el bucket staff-docs
  invoice_filename text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_payments_member_period_idx
  ON public.staff_payments (member_id, period DESC);

-- 3) Contratos enviados
CREATE TABLE IF NOT EXISTS public.staff_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id text NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  title text,
  file_path text,             -- contrato adjunto en el bucket staff-docs
  file_filename text,
  sent_at date,
  start_date date,
  end_date date,              -- null = sin vencimiento
  terms text,                 -- condiciones: mes de prueba, escalas, etc.
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_contracts_member_idx
  ON public.staff_contracts (member_id);

-- 4) RLS admin-only
ALTER TABLE public.staff_hr        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_hr_admin_all ON public.staff_hr;
CREATE POLICY staff_hr_admin_all ON public.staff_hr
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS staff_payments_admin_all ON public.staff_payments;
CREATE POLICY staff_payments_admin_all ON public.staff_payments
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS staff_contracts_admin_all ON public.staff_contracts;
CREATE POLICY staff_contracts_admin_all ON public.staff_contracts
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5) Bucket privado para facturas y contratos
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-docs', 'staff-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS staff_docs_admin_select ON storage.objects;
CREATE POLICY staff_docs_admin_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-docs' AND public.is_admin());

DROP POLICY IF EXISTS staff_docs_admin_insert ON storage.objects;
CREATE POLICY staff_docs_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-docs' AND public.is_admin());

DROP POLICY IF EXISTS staff_docs_admin_update ON storage.objects;
CREATE POLICY staff_docs_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'staff-docs' AND public.is_admin())
  WITH CHECK (bucket_id = 'staff-docs' AND public.is_admin());

DROP POLICY IF EXISTS staff_docs_admin_delete ON storage.objects;
CREATE POLICY staff_docs_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'staff-docs' AND public.is_admin());

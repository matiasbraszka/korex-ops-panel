-- personal_v2: datos personales completos + formulario de onboarding.
--
-- Amplía la ficha (staff_hr) con todos los datos personales que cada persona
-- carga al entrar a Korex, y agrega una tabla de staging (staff_onboarding)
-- donde caen las respuestas del formulario público antes de que un admin las
-- convierta en ficha del miembro.

-- 1) Campos personales en la ficha
ALTER TABLE public.staff_hr
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS document_photo_path text,
  ADD COLUMN IF NOT EXISTS profile_photo_path text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_zip text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_country text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS personal_email text,
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS payment_info text,
  ADD COLUMN IF NOT EXISTS onboarding_submitted_at timestamptz;

-- 2) Staging del onboarding (lo llena la edge function con service role)
CREATE TABLE IF NOT EXISTS public.staff_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | discarded
  name text NOT NULL,
  role text,
  gender text,
  document_number text,
  document_photo_path text,
  profile_photo_path text,
  birth_date date,
  address_street text,
  address_city text,
  address_zip text,
  address_state text,
  address_country text,
  whatsapp text,
  personal_email text,
  emergency_contact text,
  payment_info text,
  member_id text REFERENCES public.team_members(id) ON DELETE SET NULL,  -- se setea al aprobar
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_onboarding_status_idx
  ON public.staff_onboarding (status, created_at DESC);

-- 3) RLS admin-only (la inserción del público va por edge function/service role,
--    que no pasa por RLS). El panel solo deja ver/gestionar a admins.
ALTER TABLE public.staff_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_onboarding_admin_all ON public.staff_onboarding;
CREATE POLICY staff_onboarding_admin_all ON public.staff_onboarding
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

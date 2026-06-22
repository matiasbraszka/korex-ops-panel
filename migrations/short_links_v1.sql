-- short_links v1
-- Acortador de URLs propio (branded) para los links de WhatsApp del panel.
-- El panel crea el link corto vía RPC short_link_create (usuario logueado) y la
-- función pública de Vercel (api/r.js, dominio go.metodokorex.com) lo resuelve
-- con short_link_resolve, que además suma 1 a clicks. Ambas RPC son SECURITY
-- DEFINER: la tabla queda con RLS solo para authenticated (no se expone por REST
-- al anon), pero el redirect público puede resolver y contar igual.

CREATE TABLE IF NOT EXISTS public.short_links (
  code        text PRIMARY KEY,
  target_url  text NOT NULL,
  clicks      integer NOT NULL DEFAULT 0,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

-- Solo usuarios logueados del panel pueden leer/crear por REST. El redirect
-- público NO toca la tabla directo: va por la RPC SECURITY DEFINER de abajo.
DROP POLICY IF EXISTS "short_links authenticated all" ON public.short_links;
CREATE POLICY "short_links authenticated all" ON public.short_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS short_links_created_idx ON public.short_links(created_at DESC);

-- Crear un link corto: genera un code aleatorio único (6 chars, alfabeto sin
-- caracteres ambiguos) y guarda la URL destino. Restringido a links de WhatsApp
-- para que el acortador no sea un open-redirect general.
CREATE OR REPLACE FUNCTION public.short_link_create(p_url text, p_created_by text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code  text;
  v_alpha text := 'abcdefghjkmnpqrstuvwxyz23456789'; -- sin 0/o/1/l/i
  v_try   int := 0;
BEGIN
  IF p_url IS NULL OR p_url !~* '^https?://(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/' THEN
    RAISE EXCEPTION 'invalid_url';
  END IF;
  LOOP
    v_try := v_try + 1;
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.short_links (code, target_url, created_by)
      VALUES (v_code, p_url, p_created_by);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_try > 20 THEN RAISE EXCEPTION 'code_gen_failed'; END IF;
    END;
  END LOOP;
END;
$$;

-- Resolver (redirect): suma 1 a clicks y devuelve la URL destino (o NULL si no
-- existe). La llama la función pública de Vercel con la anon key.
CREATE OR REPLACE FUNCTION public.short_link_resolve(p_code text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_url text;
BEGIN
  UPDATE public.short_links
     SET clicks = clicks + 1
   WHERE code = p_code
  RETURNING target_url INTO v_url;
  RETURN v_url;
END;
$$;

-- Crear: solo usuarios logueados. Resolver: anon (lo usa el redirect público).
REVOKE ALL ON FUNCTION public.short_link_create(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.short_link_create(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.short_link_resolve(text) TO anon, authenticated;

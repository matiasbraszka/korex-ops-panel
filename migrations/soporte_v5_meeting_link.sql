-- soporte_v5: link de reunion (Zoom) en las citas. Se genera automaticamente
-- en crear-cita cuando soporte_config tiene credenciales de Zoom
-- (zoom_account_id, zoom_client_id, zoom_client_secret — Server-to-Server OAuth).

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS meeting_link text;

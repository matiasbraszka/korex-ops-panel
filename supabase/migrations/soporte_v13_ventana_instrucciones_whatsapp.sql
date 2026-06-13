-- soporte_v13: por calendario, ventana de reserva (días adelante) y
-- anticipación mínima (horas); instrucciones de la página de confirmación
-- (si vacío, no se muestra "¿Cómo asistir?"). WhatsApp por miembro para
-- avisarles cuando agendan una reunión de su calendario.

alter table public.booking_calendars add column if not exists booking_window_days integer not null default 60;
alter table public.booking_calendars add column if not exists min_notice_hours integer not null default 2;
alter table public.booking_calendars add column if not exists confirm_instructions jsonb;

alter table public.team_members add column if not exists whatsapp text;

-- Seeds: ventas mantiene las 3 instrucciones por defecto; servicio sin ellas.
update public.booking_calendars
set confirm_instructions = '[
  "Conéctate desde un lugar tranquilo, sin ruido de fondo, para dedicarle máxima atención a la reunión.",
  "Mantén la cámara encendida durante toda la reunión — la de todos los integrantes.",
  "Si tienes socios, también deben participar de la reunión; de lo contrario, deberemos cancelarla."
]'::jsonb
where confirm_instructions is null and purpose = 'ventas';

update public.booking_calendars
set confirm_instructions = '[]'::jsonb
where confirm_instructions is null;

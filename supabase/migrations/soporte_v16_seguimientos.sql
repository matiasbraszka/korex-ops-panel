-- soporte_v16: mensajes y seguimientos configurables por calendario.
--   confirmation_template: el mensaje "ni bien agenda" (override del global).
--   reminders: [{hours_before:int, message:text}] — seguimientos antes de la cita.
-- appointments.reminders_sent: horas_before ya enviadas (para N seguimientos).

alter table public.booking_calendars add column if not exists confirmation_template text;
alter table public.booking_calendars add column if not exists reminders jsonb;
alter table public.appointments add column if not exists reminders_sent jsonb not null default '[]'::jsonb;

-- Seguimientos por defecto: 24h y 2h antes (con los textos que ya se usaban).
update public.booking_calendars
set reminders = '[
  {"hours_before": 24, "message": "Hola {nombre}! Te recuerdo que mañana, el {fecha} a las {hora}, tenemos nuestra reunión. Te espero 👍"},
  {"hours_before": 2, "message": "Hola {nombre}! En un rato, a las {hora}, tenemos nuestra reunión. Nos vemos ahí 👋"}
]'::jsonb
where reminders is null;

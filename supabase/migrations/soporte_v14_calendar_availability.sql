-- soporte_v14: franjas horarias propias del calendario (opcional). Si está
-- vacío/null, los huecos salen solo de la intersección de la disponibilidad
-- de los miembros. Si tiene franjas, se intersectan además con estas.
-- Formato igual que team_members.availability: {days:{0-6:{enabled,ranges:[{from,to}]}}}
alter table public.booking_calendars add column if not exists availability jsonb;

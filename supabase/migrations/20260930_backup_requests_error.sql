-- Solicitudes de respaldo: motivo del fallo (el equipo marca failed en vez de
-- dejar la solicitud en pending eterno). Aplicar en el SQL editor del proyecto
-- "preciosaldia rebranding" (sodgzkablshladvbtnes).
alter table public.backup_requests
  add column if not exists error text;

-- 004-device-upload-credentials.sql
-- APLICADA EN PRODUCCIÓN el 2026-10-13 (sodgzkablshladvbtnes), fuera del historial de migraciones:
-- la tabla existe con este esquema, RLS, 0 filas al verificar y sin privilegios para anon/authenticated.
-- Staging (tdfcpwctvumbdjmifypd) tiene la misma tabla. No volver a ejecutar sobre una base que ya la tenga.
-- Guarda solo el SHA-256 del secreto por dispositivo. Ver
-- docs/plans/2026-10-13-pos-device-credential.md.

begin;

create table if not exists public.device_upload_credentials (
  device_id text primary key
    check (device_id = upper(device_id) and char_length(device_id) between 8 and 64),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

alter table public.device_upload_credentials enable row level security;
revoke all on public.device_upload_credentials from public, anon, authenticated;
grant select, insert, update on public.device_upload_credentials to service_role;

commit;

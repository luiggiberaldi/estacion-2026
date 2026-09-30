-- 20260930_visits_notifications.sql
-- Feature 1: registro de visitas (toda persona que abre el link queda registrada).
-- Feature 2: centro de notificaciones (demos nuevas/por vencer/vencidas,
-- respaldos fallidos, dispositivos nuevos).
--
-- RLS habilitado SIN policies: el anon key público no lee ni escribe;
-- la Estación accede con service_role (bypasea RLS). No mezclar Lite/Pro:
-- estas tablas son globales de la Estación (visitas al panel, eventos
-- administrativos); cuando un evento es por producto se guarda product_id
-- ('bodega' | 'pro') solo como etiqueta informativa.

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  path text,
  ip text,
  user_agent text,
  referer text,
  country text,
  city text,
  screen text,
  lang text,
  tz text
);
create index if not exists visits_created_at_idx on public.visits (created_at desc);
alter table public.visits enable row level security;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  title text not null,
  body text,
  ref_id text,
  product_id text,
  read_at timestamptz,
  unique (type, ref_id)
);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);
alter table public.notifications enable row level security;

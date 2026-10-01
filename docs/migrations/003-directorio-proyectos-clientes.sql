-- 003: directorio de proyectos Supabase por cliente (plan Pro nube propia)
-- Aplicar en el proyecto Estación (sodgzkablshladvbtnes), vía:
--   python3 mgmt.py POST /v1/projects/<ref>/database/query --data-file ddl.json
-- con {"query": "<contenido de este archivo>"}.
-- El token debe pertenecer a la cuenta de Supabase dueña del proyecto Estación.
-- Idempotente: puede correrse más de una vez.

create table if not exists public.customer_projects (
  license_code text primary key,
  account_email text,
  business_name text,
  phone text,
  supabase_url text not null,
  supabase_anon_key text not null,
  product_id text not null default 'pro',
  status text not null default 'active',
  last_keepalive timestamptz,
  created_at timestamptz not null default now()
);

alter table public.customer_projects enable row level security;

-- Búsqueda pública del proyecto del cliente por código de licencia.
-- Solo devuelve url + anon key (la anon key es pública por diseño de Supabase).
create or replace function public.lookup_customer_project(p_code text)
returns table (supabase_url text, supabase_anon_key text)
language sql security definer stable
set search_path = public
as $$ select cp.supabase_url, cp.supabase_anon_key from public.customer_projects cp where cp.license_code = p_code and cp.status = 'active' $$;

grant execute on function public.lookup_customer_project(text) to anon;

-- 010 · Rendimiento de políticas RLS (auditoría DB6, 2026-11-17)
--
-- 1. En las políticas de `public`, `auth.uid()` pasa a `(select auth.uid())`.
--    El resultado es idéntico: Postgres lo calcula una vez por consulta en vez de
--    una vez por fila (aviso `auth_rls_initplan` del advisor). Se reescribe el
--    texto de cada política tal como está en la base, así sirve igual en staging
--    y prod, y no toca las que ya están envueltas.
-- 2. Índice en `device_sessions.user_id` (la política select_own filtra por él).
--
-- NO se unen las políticas permisivas de `sync_documents`: son las reglas de
-- sincronización de las cajas; unirlas puede cambiar permisos y la ganancia es
-- mínima con el volumen actual.
--
-- No cambia quién puede ver o escribir qué. No borra datos.

do $$
declare
  p record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
       and coalesce(qual, '') !~* 'select auth\.uid\(\)'
       and coalesce(with_check, '') !~* 'select auth\.uid\(\)'
  loop
    new_qual  := regexp_replace(p.qual,       'auth\.uid\(\)', '(select auth.uid())', 'g');
    new_check := regexp_replace(p.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;
    raise notice '%', stmt;
    execute stmt;
  end loop;
end $$;

create index if not exists device_sessions_user_id_idx on public.device_sessions (user_id);

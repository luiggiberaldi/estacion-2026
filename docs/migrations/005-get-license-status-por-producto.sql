-- 005-get-license-status-por-producto.sql
-- ============================================================
-- ESTADO: PREPARADA, **NO APLICADA**. Requiere aprobación explícita.
-- Base objetivo: proyecto de la Estación (licencias), el mismo de bodega.
-- Fecha de redacción: 2026-10-30 (producto Farmacia).
--
-- MOTIVO: get_license_status(p_device_id) tiene `product_id = 'bodega'` fijo.
-- Las cajas de Farmacia registran su licencia con product_id = 'farmacia'
-- (auto_register_device / activate_demo_secure ya reciben p_product_id), así que
-- esa función no las encuentra y la caja cae al fallback de SELECT directo con la
-- anon key — el mismo fallback que la migración 001 quiere cerrar.
--
-- CAMBIO: se AGREGA una sobrecarga get_license_status(p_device_id, p_product_id).
--   · Aditivo: la versión de 1 argumento (la que usan las cajas de bodega) NO se
--     toca. PostgREST elige la firma por los nombres de los argumentos enviados:
--     {p_device_id} → versión actual; {p_device_id, p_product_id} → la nueva.
--   · Mismo cuerpo, mismas columnas devueltas, SECURITY DEFINER y search_path fijo.
--   · Mismos permisos de ejecución que la versión actual (anon y authenticated).
--
-- VERIFICACIÓN (solo lectura) tras aplicar:
--   select oid::regprocedure, prosecdef from pg_proc
--    where proname = 'get_license_status';           -- deben salir las DOS firmas
--   select * from get_license_status('PDA-V2-XXXX');   -- bodega: igual que antes
--
-- REVERSIÓN:
--   drop function if exists public.get_license_status(text, text);
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_license_status(p_device_id text, p_product_id text)
 RETURNS TABLE(type text, is_active boolean, expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT type, is_active, expires_at, created_at
      FROM public.licenses
     WHERE device_id  = p_device_id
       AND product_id = p_product_id
     LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_license_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_license_status(text, text) TO anon, authenticated, service_role;

COMMIT;

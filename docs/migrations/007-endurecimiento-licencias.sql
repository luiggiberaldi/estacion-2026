-- 007-endurecimiento-licencias.sql
-- ============================================================
-- ESTADO: PREPARADA, **NO APLICADA** en producción. Requiere aprobación explícita.
-- Base objetivo: proyecto de la Estación (licencias), el mismo de bodega.
-- Fecha de redacción: 2026-10-31 (auditoría Estación 2.0).
--
-- QUÉ CAMBIA (no cambia lo que devuelve ninguna función):
--   1. auto_register_device y heartbeat_device son SECURITY DEFINER pero no
--      fijan search_path: quien pueda crear objetos en otro esquema del
--      search_path podría suplantar tablas. Se fija `search_path = public`,
--      igual que el resto de funciones de licencias.
--   2. licenses no tiene unicidad por (device_id, product_id). Hoy hay 0
--      duplicados (verificado 2026-10-31), pero dos activaciones simultáneas
--      podrían crear dos filas y las funciones toman "la primera". Se agrega
--      un índice único que lo impide.
--
-- PRE-CHEQUEO (debe devolver 0; si no, NO aplicar y avisar):
--   select count(*) from (select device_id, product_id from licenses
--     where device_id is not null group by 1,2 having count(*) > 1) x;
--
-- VERIFICACIÓN tras aplicar:
--   select proname, proconfig from pg_proc
--    where proname in ('auto_register_device','heartbeat_device');  -- {search_path=public}
--   select indexname from pg_indexes where indexname = 'licenses_device_product_key';
--
-- REVERSIÓN:
--   alter function public.auto_register_device(text, text, text) reset search_path;
--   alter function public.heartbeat_device(text, text, text) reset search_path;
--   drop index if exists public.licenses_device_product_key;
-- ============================================================

BEGIN;

ALTER FUNCTION public.auto_register_device(text, text, text) SET search_path = public;
ALTER FUNCTION public.heartbeat_device(text, text, text) SET search_path = public;

CREATE UNIQUE INDEX IF NOT EXISTS licenses_device_product_key
    ON public.licenses (device_id, product_id)
 WHERE device_id IS NOT NULL;

COMMIT;

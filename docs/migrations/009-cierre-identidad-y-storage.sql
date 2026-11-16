-- ============================================================
-- 009 · Cierre de identidad por cabecera, vínculo directo de cajas y
--       escritura pública en el catálogo de imágenes.
-- Origen: AUDITORIA-BASE-DATOS-ESTACION-2026-11-16.md (DB1, DB2, DB3)
-- Base: operativa compartida Estación/POS (prod sodgzkablshladvbtnes,
--       staging tdfcpwctvumbdjmifypd). Primero staging, luego producción.
--
-- QUÉ HACE
--   DB1  current_device_id(): la cabecera x-device-id solo vale si la fila
--        de device_sessions de ese equipo pertenece a auth.uid(). Antes
--        bastaba con que el ID existiera: con la llave anon pública y el ID
--        de un monitor se leía cloud_backups / sync_documents de su caja.
--   DB2  device_sessions: se quitan INSERT y UPDATE directos. El vínculo
--        equipo↔sesión solo se crea por register_device_session /
--        claim_device_session (con prueba de posesión). Antes cualquiera
--        podía apartar IDs ajenos sin registrar.
--   DB3  storage product-images: se quitan insert/update/delete de anon y
--        authenticated. Queda solo la lectura pública. Los scripts de la
--        Estación suben con la service role (no depende de políticas).
--
-- POR QUÉ NO ROMPE A LOS CLIENTES (verificado en el código, 2026-11-16)
--   - Ningún POS (Bodega, Farmacia, Nube) envía x-device-id: hoy la rama de
--     current_device_id() en las políticas solo la usaría un atacante.
--   - deviceIdentity.js usa las RPC; el INSERT directo solo corre si la RPC
--     no existe (PGRST202/42883). No hay UPDATE directo en ningún POS.
--   - Ningún POS escribe en el bucket product-images.
--
-- VERIFICACIÓN (solo lectura) tras aplicar:
--   select policyname from pg_policies
--    where (tablename='device_sessions' and cmd in ('INSERT','UPDATE'))
--       or policyname like 'product_images_anon_%';          -- 0 filas
--   select pg_get_functiondef('public.current_device_id()'::regprocedure)
--     ~ 'user_id = auth.uid\(\)';                            -- true
--
-- ROLLBACK (definiciones originales de producción, copiadas el 2026-11-16):
--   begin;
--   CREATE OR REPLACE FUNCTION public.current_device_id()
--    RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   declare header_device text; registered text;
--   begin
--       begin
--           header_device := nullif(current_setting('request.headers', true)::json->>'x-device-id', '');
--       exception when others then header_device := null; end;
--       if header_device is null then return null; end if;
--       select device_id into registered from public.device_sessions where device_id = header_device;
--       if found then return registered; end if;
--       return null;
--   end;
--   $function$;
--   CREATE POLICY device_sessions_insert_own ON public.device_sessions AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK ((auth.uid() = user_id));
--   CREATE POLICY device_sessions_update_own ON public.device_sessions AS PERMISSIVE FOR UPDATE TO anon, authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
--   CREATE POLICY product_images_anon_insert ON storage.objects AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK ((bucket_id = 'product-images'::text));
--   CREATE POLICY product_images_anon_update ON storage.objects AS PERMISSIVE FOR UPDATE TO anon, authenticated USING ((bucket_id = 'product-images'::text)) WITH CHECK ((bucket_id = 'product-images'::text));
--   CREATE POLICY product_images_anon_delete ON storage.objects AS PERMISSIVE FOR DELETE TO anon, authenticated USING ((bucket_id = 'product-images'::text));
--   commit;
-- ============================================================

BEGIN;

-- DB1 ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_device_id()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    header_device text;
    owned         text;
begin
    begin
        header_device := nullif(current_setting('request.headers', true)::json->>'x-device-id', '');
    exception when others then
        header_device := null;
    end;

    -- Sin cabecera o sin sesión: no hay identidad de equipo.
    if header_device is null or auth.uid() is null then
        return null;
    end if;

    -- La cabecera solo vale si la sesión que llama es dueña de ese equipo.
    select ds.device_id into owned
      from public.device_sessions ds
     where ds.device_id = header_device
       and ds.user_id = auth.uid();

    return owned; -- null si el equipo no es de esta sesión
end;
$function$;

-- DB2 ---------------------------------------------------------------------
DROP POLICY IF EXISTS device_sessions_insert_own ON public.device_sessions;
DROP POLICY IF EXISTS device_sessions_update_own ON public.device_sessions;
-- Se mantiene device_sessions_select_own (lo usa verifyDeviceSessionRegistered).

-- DB3 ---------------------------------------------------------------------
DROP POLICY IF EXISTS product_images_anon_insert ON storage.objects;
DROP POLICY IF EXISTS product_images_anon_update ON storage.objects;
DROP POLICY IF EXISTS product_images_anon_delete ON storage.objects;
-- Se mantiene product_images_public_read.

COMMIT;

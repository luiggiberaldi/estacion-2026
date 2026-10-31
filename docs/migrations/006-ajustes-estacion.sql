-- 006-ajustes-estacion.sql
-- ============================================================
-- ESTADO: PREPARADA, **NO APLICADA** en producción. Requiere aprobación explícita.
-- Base objetivo: proyecto de la Estación (licencias), el mismo de bodega.
-- Fecha de redacción: 2026-10-31 (Estación 2.0, zona de Ajustes).
--
-- QUÉ AGREGA (todo aditivo, nada existente se borra):
--   1. station_settings: configuración editable desde Ajustes.
--        · fila 'config'    → precios, días de demo, días de gracia, contacto,
--                             plantillas de WhatsApp. Pública vía RPC (sin PIN).
--        · fila 'admin_pin' → huella SHA-256 del PIN de la Estación y su versión.
--                             NUNCA sale por un RPC; solo la lee la service role.
--   2. station_login_failures: intentos fallidos de PIN, para frenar la fuerza
--      bruta entre todas las instancias de Vercel (el freno en memoria no basta).
--   3. get_product_terms(p_product_id): precio vivo para las cajas. Devuelve
--      precios, días de demo/gracia y contacto del producto. Ejecutable por anon.
--   4. activate_demo_secure: los días de la demo automática salen de Ajustes
--      (antes '3 days' fijo) y solo acepta productos conocidos.
--
-- Sin la fila 'config' todo sigue funcionando con los valores de licensePolicy.js:
-- la Estación y las cajas caen a esos valores si el RPC falla o no existe.
--
-- VERIFICACIÓN (solo lectura) tras aplicar:
--   select key, updated_at from station_settings;              -- 'config'
--   select get_product_terms('bodega');                        -- precios de Lite
--   select get_product_terms('farmacia');                      -- precios de Farmacia
--   select get_product_terms('otro');                          -- null
--   set role anon; select * from station_settings;             -- 42501 (sin acceso)
--   reset role;
--
-- REVERSIÓN (deja todo como antes de 006):
--   begin;
--   drop function if exists public.get_product_terms(text);
--   -- activate_demo_secure: volver a crear la versión anterior (al final del archivo)
--   drop table if exists public.station_login_failures;
--   drop table if exists public.station_settings;
--   commit;
-- ============================================================

BEGIN;

-- 1. Ajustes ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.station_settings (
    key        text PRIMARY KEY CHECK (key IN ('config', 'admin_pin')),
    data       jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.station_settings ENABLE ROW LEVEL SECURITY;
-- Sin políticas: anon y authenticated no ven nada. La Estación usa la service role.
REVOKE ALL ON TABLE public.station_settings FROM anon, authenticated;

INSERT INTO public.station_settings (key, data) VALUES (
    'config',
    jsonb_build_object(
        'products', jsonb_build_object(
            'bodega',   jsonb_build_object('permanent', 100, 'monthly', 10, 'demoDays', 3, 'demoExtensionDays', 7, 'monthlyGraceDays', 5),
            'farmacia', jsonb_build_object('permanent', 300, 'monthly', 20, 'demoDays', 3, 'demoExtensionDays', 7, 'monthlyGraceDays', 5)
        ),
        'contact', jsonb_build_object('businessName', 'PreciosAlDía', 'whatsapp', '', 'email', '', 'paymentInfo', ''),
        'templates', '{}'::jsonb
    )
) ON CONFLICT (key) DO NOTHING;

-- 2. Intentos fallidos de PIN ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.station_login_failures (
    id  bigserial PRIMARY KEY,
    ip  text NOT NULL,
    at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS station_login_failures_at_idx ON public.station_login_failures (at);

ALTER TABLE public.station_login_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.station_login_failures FROM anon, authenticated;

-- 3. Precio vivo para las cajas ----------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_terms(p_product_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT CASE
             WHEN s.data -> 'products' -> p_product_id IS NULL THEN NULL
             ELSE jsonb_build_object(
                 'productId',        p_product_id,
                 'permanent',        (s.data -> 'products' -> p_product_id ->> 'permanent')::numeric,
                 'monthly',          (s.data -> 'products' -> p_product_id ->> 'monthly')::numeric,
                 'demoDays',         (s.data -> 'products' -> p_product_id ->> 'demoDays')::int,
                 'monthlyGraceDays', (s.data -> 'products' -> p_product_id ->> 'monthlyGraceDays')::int,
                 'contact', jsonb_build_object(
                     'businessName', s.data -> 'contact' ->> 'businessName',
                     'whatsapp',     s.data -> 'contact' ->> 'whatsapp',
                     'email',        s.data -> 'contact' ->> 'email'
                 ),
                 'updatedAt', s.updated_at
             )
           END
      FROM public.station_settings s
     WHERE s.key = 'config';
$function$;

REVOKE ALL ON FUNCTION public.get_product_terms(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_terms(text) TO anon, authenticated, service_role;

-- 4. Demo automática con días configurables ------------------------------------

CREATE OR REPLACE FUNCTION public.activate_demo_secure(p_device_id text, p_product_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id        UUID;
    v_type      TEXT;
    v_is_active BOOLEAN;
    v_days      INT;
BEGIN
    -- Solo productos que se venden hoy (antes aceptaba cualquier texto).
    IF p_product_id NOT IN ('bodega', 'farmacia') THEN
        RETURN false;
    END IF;

    -- Días de la demo desde Ajustes; 3 si no hay ajuste. Acotado a 1..30.
    SELECT LEAST(GREATEST(COALESCE((data -> 'products' -> p_product_id ->> 'demoDays')::int, 3), 1), 30)
      INTO v_days
      FROM public.station_settings
     WHERE key = 'config';
    v_days := COALESCE(v_days, 3);

    SELECT id, type, is_active
      INTO v_id, v_type, v_is_active
      FROM public.licenses
     WHERE device_id  = p_device_id
       AND product_id = p_product_id;

    -- Caso 1: Sin registro previo → insertar demo nueva
    IF v_id IS NULL THEN
        INSERT INTO public.licenses (device_id, product_id, type, code, is_active, expires_at)
        VALUES (
            p_device_id,
            p_product_id,
            'demo3',
            'DEMO-' || upper(substring(md5(random()::text) from 1 for 10)),
            true,
            NOW() + make_interval(days => v_days)
        );
        RETURN true;
    END IF;

    -- Caso 2: Registro inicial sin activar ('registered') → promover a demo
    IF v_type = 'registered' THEN
        UPDATE public.licenses
           SET type       = 'demo3',
               is_active  = true,
               expires_at = NOW() + make_interval(days => v_days),
               updated_at = NOW()
         WHERE id = v_id;
        RETURN true;
    END IF;

    -- Caso 3: Demo activa o suscripción → ya fue usada, no repetir
    RETURN false;
END;
$function$;

COMMIT;

-- ============================================================
-- Versión ANTERIOR de activate_demo_secure (para la reversión): idéntica a la
-- de arriba pero sin el filtro de producto y con `NOW() + INTERVAL '3 days'`
-- en los dos lugares donde arriba dice make_interval(days => v_days).
-- ============================================================

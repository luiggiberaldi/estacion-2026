-- ============================================================
-- 008 · Códigos de vinculación para la credencial de respaldo por equipo
-- Origen: plan de fixeo 2026-11-16, fase F3 (hallazgo A1).
-- Base: operativa compartida Estación/POS (prod sodgzkablshladvbtnes,
--       staging tdfcpwctvumbdjmifypd). Requiere 004 (device_upload_credentials).
--
-- FLUJO
--   1. En la Estación (Dispositivos → "Vincular respaldo") el admin genera un
--      código de 8 caracteres para UN equipo. Vale 15 min y un solo uso.
--   2. En la caja, el dueño escribe el código. La caja llama a
--      POST /api/backup/device-credential/claim { deviceId, code }.
--   3. La Estación comprueba el código, crea la credencial del equipo (solo
--      se guarda su sha256 en device_upload_credentials) y la entrega UNA vez.
--   4. Desde ahí el relay de respaldos exige esa credencial; el secreto
--      compartido (público en el JS de los POS) deja de servir.
--
-- SEGURIDAD
--   - Solo se guarda el sha256 del código, nunca el código.
--   - RLS activo y sin políticas: solo la service role (Estación) lee y escribe.
--   - device_claim_failures alimenta el freno de intentos (por IP y por equipo).
--
-- VERIFICACIÓN (solo lectura) tras aplicar:
--   select to_regclass('public.device_credential_claims'),
--          to_regclass('public.device_claim_failures');          -- ambos no nulos
--   select relrowsecurity from pg_class
--    where relname in ('device_credential_claims','device_claim_failures'); -- true, true
--
-- ROLLBACK
--   begin;
--   drop table if exists public.device_claim_failures;
--   drop table if exists public.device_credential_claims;
--   commit;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.device_credential_claims (
    code_hash   text PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
    device_id   text NOT NULL
        CHECK (device_id = upper(device_id) AND char_length(device_id) BETWEEN 8 AND 64),
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz
);
CREATE INDEX IF NOT EXISTS device_credential_claims_device_idx
    ON public.device_credential_claims (device_id);

ALTER TABLE public.device_credential_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_credential_claims FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_credential_claims TO service_role;

CREATE TABLE IF NOT EXISTS public.device_claim_failures (
    id         bigserial PRIMARY KEY,
    ip         text,
    device_id  text,
    at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_claim_failures_at_idx
    ON public.device_claim_failures (at);

ALTER TABLE public.device_claim_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_claim_failures FROM public, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.device_claim_failures TO service_role;
GRANT USAGE ON SEQUENCE public.device_claim_failures_id_seq TO service_role;

COMMIT;

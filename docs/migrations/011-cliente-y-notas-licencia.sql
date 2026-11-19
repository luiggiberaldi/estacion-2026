-- 011 · Nombre del cliente y notas en cloud_licenses
--
-- El formulario de licencias pedía "Cliente" y aceptaba notas, pero la tabla no
-- tenía dónde guardarlos y se descartaban en silencio. Columnas opcionales:
-- no cambian ninguna política ni afectan a los POS (que no las leen).
--
-- Aplicar primero en staging y después en producción.

BEGIN;

ALTER TABLE public.cloud_licenses
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.cloud_licenses
  DROP CONSTRAINT IF EXISTS cloud_licenses_client_name_len,
  ADD CONSTRAINT cloud_licenses_client_name_len CHECK (client_name IS NULL OR char_length(client_name) <= 120),
  DROP CONSTRAINT IF EXISTS cloud_licenses_notes_len,
  ADD CONSTRAINT cloud_licenses_notes_len CHECK (notes IS NULL OR char_length(notes) <= 1000);

-- Recargar la caché de esquema de PostgREST para que vea las columnas nuevas.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback:
-- BEGIN;
-- ALTER TABLE public.cloud_licenses
--   DROP CONSTRAINT IF EXISTS cloud_licenses_client_name_len,
--   DROP CONSTRAINT IF EXISTS cloud_licenses_notes_len,
--   DROP COLUMN IF EXISTS client_name,
--   DROP COLUMN IF EXISTS notes;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;

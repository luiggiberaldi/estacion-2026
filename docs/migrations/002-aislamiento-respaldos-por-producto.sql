-- 002-aislamiento-respaldos-por-producto.sql
-- ============================================================
-- ESTADO: PREPARADA, **NO APLICAR** todavía.
-- Fecha de redacción: 2026-09-30 (fixeo general Estación, Fase 6).
--
-- MOTIVO: `backup_requests` y `cloud_backups` no tienen `product_id`.
-- Hoy todo el flujo de respaldos es Lite-implícito. Antes de conectar
-- Pro (multilocal) a este flujo, las tablas deben aislar por producto
-- (regla permanente: nunca mezclar Lite y Pro).
--
-- POR QUÉ NO SE APLICA AHORA:
-- 1. El POS Lite en campo NO envía `productId` al completar respaldos
--    (`/api/backup/complete`): el endpoint tendría que seguir aceptando
--    solicitudes sin producto durante la transición.
-- 2. El POS Pro (multilocal) aún no está conectado al flujo de respaldos.
-- 3. Tocar los clientes Lite/Pro está fuera del alcance de esta ronda.
--
-- PLAN DE APLICACIÓN (cuando luigi lo autorice, en este orden):
--   1. Aplicar este SQL en el SQL editor del proyecto
--      `sodgzkablshladvbtnes` (la columna es NULLABLE: no rompe nada
--      existente; el código actual sigue funcionando).
--   2. Backfill: las filas existentes son todas Lite (`bodega`).
--      (Incluido abajo, pero revisar antes de correr.)
--   3. Cambios de código Estación (misma release):
--      - `requestBackup` / `requestAllBackups`: incluir `product_id` en el
--        insert de `backup_requests`.
--      - `/api/backup/complete`: exigir `productId` en el body, validarlo
--        contra ('bodega','pro') y guardarlo en `cloud_backups.product_id`.
--        Durante la transición aceptar ausencia => 'bodega' SOLO con log
--        de advertencia (los Lite en campo sin actualizar no lo envían).
--      - `getBackups()`: filtrar por producto visible.
--   4. Cambios de cliente (releases coordinados, fuera de esta ronda):
--      - Lite (`useAutoBackup.js`): enviar `productId: 'bodega'` al
--        completar el respaldo.
--      - Pro (multilocal): enviar `productId: 'pro'` cuando se conecte
--        al flujo de respaldos. **No conectar Pro sin esto.**
-- ============================================================

-- 1. Columnas (idempotente)
alter table public.backup_requests
  add column if not exists product_id text;

alter table public.cloud_backups
  add column if not exists product_id text;

-- 2. Índices para el cruce (device_id, product_id)
create index if not exists idx_backup_requests_device_product
  on public.backup_requests (device_id, product_id);

create index if not exists idx_cloud_backups_device_product
  on public.cloud_backups (device_id, product_id);

-- 3. Backfill: todo lo histórico es Lite (revisar antes de correr)
-- update public.backup_requests set product_id = 'bodega' where product_id is null;
-- update public.cloud_backups set product_id = 'bodega' where product_id is null;

-- 4. (Opcional, después del paso 3 del plan) NOT NULL una vez que el código
--    siempre lo envía:
-- alter table public.backup_requests alter column product_id set not null;
-- alter table public.cloud_backups alter column product_id set not null;

# bitacora.md — La Estación 2026

Registro de cambios: qué cambió y por qué. Regla: ningún commit sin su entrada.

---

## 2026-09-30 — Fix respaldos silenciosos (parte estación)

**Qué:** La vista Backups ahora muestra solicitudes de respaldo fallidas con badge
"Fallido" junto al device_id (el motivo aparece como tooltip).

**Por qué:** El pipeline de respaldos era silencioso: cualquier fallo en el
equipo se tragaba (catch sin propagar) y la estación mostraba el dispositivo
como "Solicitado" eternamente. Se añadieron:

- `FailedBackupRequest` + `getFailedBackupRequests()` en `src/lib/actions.ts`
  (tolerante a que la columna `backup_requests.error` aún no exista).
- Migración `supabase/migrations/20260930_backup_requests_error.sql`
  (`backup_requests.error text`) — **pendiente de aplicar** en el SQL editor
  del proyecto "preciosaldia rebranding" (el token de management no tiene
  permiso en ese proyecto).
- Badge "Fallido" en `backups-view.tsx` junto a "Solicitado".

**Decisión pendiente de luigi:** los respaldos aún no llevan `product_id`
(regla permanente: nunca mezclar Lite y Pro). Los 41 pendientes zombie se
limpiaron marcándolos `failed` por producto (40 `bodega`/Lite + 1 `test`).
Cuando se haga product-aware: `backup_requests.product_id`,
`cloud_backups.product_id`, endpoint que exija y valide el producto, y el POS
Lite original (el que corre en campo) debe recibir el mismo fix de
`useAutoBackup.js` que hoy solo existe en el multilocal (Pro).

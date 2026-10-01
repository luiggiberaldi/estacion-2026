# bitacora.md — La Estación 2026

Registro de cambios: qué cambió y por qué. Regla: ningún commit sin su entrada.

---

## 2026-09-30 — Fixeo general Estación, Fases 2–5 (rama `feat/producto-lite-pro`, sin commit aún)

Alcance: solo la Estación. No se tocó Lite ni Pro.

### Fase 2 — Respaldos con información honesta

**Qué:** la vista Respaldos mostraba el badge "Fallido" pegado a filas de
respaldos *completados* (confuso) y los errores históricos de las solicitudes
zombie salían en crudo.

**Cambios** (`backups-view.tsx`, `actions.ts`, `utils.ts`):
- Sección independiente "Solicitudes fallidas": alias/ID corto, fecha
  relativa, motivo en lenguaje de usuario, detalle técnico expandible y botón
  "Solicitar de nuevo".
- Errores históricos "zombie/pre-fix" traducidos a lenguaje de usuario.
- KPI renombrado a "Solicitudes fallidas" (cuenta `failedRequests`).
- `getFailedBackupRequests()` resuelve alias desde `cloud_licenses`;
  `FailedBackupRequest` incluye `alias`.
- Nuevo `shortDeviceId()` compartido en `utils.ts`.
- Terminología visible unificada: "Backup" → "Respaldo" (vista + navegación).

**Por qué:** un respaldo fallido no es un respaldo completado; mezclarlos en la
misma fila hacía creer que había respaldo cuando no lo había.

### Fase 3 — Tabla Dispositivos sin desborde

**Qué:** el `device_id` completo (44 caracteres) rompía la tabla a 1440px y en
móvil; la columna Acciones quedaba fuera de vista.

**Cambios** (`devices-view.tsx`):
- ID abreviado con `shortDeviceId()` + botón copiar ID completo; `title` con el
  ID completo.
- Columna Acciones `sticky right-0`; ancho mínimo de Dispositivo reducido.
- Respaldos usa el mismo ID abreviado por consistencia.

**Por qué:** el ID completo no aporta nada en la fila; el que lo necesita lo
copia con un clic.

### Fase 4 — Cosméticos y textos

**Cambios** (`dashboard-view.tsx`, `admin-shell.tsx`, `licenses-view.tsx`,
`backups-view.tsx`):
- Header del Dashboard: `PreciosAlDía Lite/Pro` sin `uppercase tracking-widest`
  (la grafía oficial de la marca no se toca).
- Actividad reciente: tipos traducidos (`registered`→"registrada",
  `permanent`→"permanente", `monthly`→"mensual", etc.).
- Email del sidebar con `title` (email completo en tooltip).
- "Online: Sí/No" → "En línea/Desconectado".
- Navegación "Backups" → "Respaldos"; resto de "backup"→"respaldo" en la vista.

**F6 (65 vs 66 "Sin licencia") — resuelto, no era bug:** en BD hay 66 filas
`type='registered'`, pero una tiene `product_id='test'` (fila de prueba,
device_id literal "test"). La vista filtra por producto, así que Lite muestra
correctamente 65. El scoping por producto está funcionando como debe.

### Fase 5 — Datos honestos

**B1–B4. Demos con estado real** (`types.ts`, `actions.ts`, `demos-view.tsx`,
`dashboard-view.tsx`):
- `Demo` ahora incluye `status: LicenseStatus` (antes la vista ignoraba
  `is_active` y mostraba demos revocadas como activas).
- Nueva pestaña "Revocadas" con su conteo; las revocadas ya no aparecen en
  Activas/Por expirar/Expiradas.
- Badge "Revocada" en la tarjeta; barra de "Tiempo restante" oculta en
  revocadas (no tiene sentido).
- "Extender 7d" deshabilitado en revocadas: el código actual lo reactivaría
  silenciosamente (`status:"active"`), trampa peligrosa.
- "Permanente" en revocadas pide confirmación explícita ("¿Reactivar como
  permanente?") porque convierte+reactiva.
- Botón revocar deshabilitado si ya está revocada.
- "Expira" ahora muestra año (las demos 2027 existen, ver E3).

**C1. "En línea" real** (`actions.ts`): `getLicenses()` cruzaba
`licenses.updated_at` como última conexión — cualquier acción administrativa
(p. ej. la revocación masiva del 2026-09-30) inflaba el conteo de "en línea".
Ahora usa `account_devices.last_seen` (única fuente real). Sin
`account_devices`, la última conexión es `null` ("nunca"), sin fallback
mentiroso.

**E1. Sin metadata fabricada** (`types.ts`, `actions.ts`, vistas):
`getLicenses()` y `getDevices()` devolvían `platform:"android"` y
`appVersion:"2.0.0"` inventados — el esquema no tiene esas columnas. Ahora son
`null` ("—" en la UI, sin badge de plataforma inventado). Si algún día el POS
reporta plataforma/versión, se agregan columnas reales.

**E2. RLS de lectura en `licenses` — investigado, NO aplicado:**
- El POS Lite en campo verifica licencia con `rpc('get_license_status')`
  primero, pero tiene **fallback en vivo** a SELECT directo con anon key
  (`useLicenseMonitoring.js`). Revocar el SELECT anónimo rompería ese
  fallback en equipos reales.
- El token de management disponible no tiene permiso sobre este proyecto
  (403), así que ni siquiera se pudo auditar las policies actuales.
- Decisión: no se restringe en esta ronda (tocar el cliente Lite está fuera
  de alcance). Quedó preparada y documentada la migración en
  `docs/migrations/001-restringir-lectura-anon-licenses.sql` con el plan de
  aplicación en 3 pasos (RPC SECURITY DEFINER → release Lite sin fallback →
  revocar). Requiere autorización y release coordinado.

**E3. Expiraciones 2027 — investigado, datos de prueba:**
4 demos `demo7` con `expires_at=2027-05-29` (creadas 2026-07-13 al 2026-07-27).
Son dispositivos de prueba (`business_name`: "1233", "1", "1234") con fecha
futura puesta a mano durante desarrollo. Las 4 ya están revocadas
(`is_active=false`, revocación masiva 2026-09-30) y ahora aparecen
correctamente como "Revocada" en Demos. No hay bug de código; no se borran
filas sin autorización de luigi.

**QA:** `tsc --noEmit` limpio, ESLint limpio en archivos tocados.
Pendiente: verificación visual en el teléfono de luigi (incluye el subtítulo
del selector de producto de Fase 4).

### Fase 6 — Scoping por producto

**D1. Acciones rápidas con producto** (`licenses-view.tsx`): "Activar demo" y
"Convertir a permanente" del menú de fila no pasaban `productId` →
`createOrUpdateLicense` defaulteaba a `'bodega'` y creaba licencias Lite
estando en vista Pro. Ahora pasan `(lic.productId ?? productId)` del contexto.

**D2. `cloud_licenses` es metadata global del dispositivo** (`actions.ts`):
decisión documentada — alias/negocio/email/teléfono son atributos del equipo,
no de la licencia; se sigue leyendo por `device_id`.
- `revokeLicense`: `licenses` ya iba scoped por `(device_id, product_id)`;
  el espejo `cloud_licenses.is_active` (que nada lee para decidir status)
  ahora refleja si queda *alguna* licencia activa del equipo en *cualquier*
  producto, en vez de ponerse en `false` a ciegas.
- `deleteLicense`: la fila de `cloud_licenses` solo se borra si el equipo ya
  no tiene licencias en ningún producto (antes se borraba la metadata del
  otro producto junto con la licencia).

**D3. Acciones globales sin default silencioso** (`actions.ts`,
`backups-view.tsx`, `devices-view.tsx`):
- `requestAllBackups(productId)` y `sendRemoteReloadCommand(productId,
  deviceId?)` ahora exigen el producto (antes `getLicenses()` sin argumento
  = Lite silencioso).
- Las vistas Respaldos y Dispositivos usan el producto visible del contexto
  (`useProduct()`); el modal "Solicitar respaldo" lista cuentas del producto
  visible y lo etiqueta; los toasts nombran el producto
  ("...de PreciosAlDía Lite").
- Quedan 3 llamados a `getLicenses()` sin producto en todo el código: cero
  (verificado con grep).

**Aislamiento de respaldos por producto — preparado, NO aplicado:**
`docs/migrations/002-aislamiento-respaldos-por-producto.sql` agrega
`product_id` (nullable) a `backup_requests` y `cloud_backups` + índices
`(device_id, product_id)`, con plan de aplicación en 4 pasos. No se aplica
ahora porque: (1) el Lite en campo no envía `productId` al completar
respaldos, (2) Pro aún no está conectado al flujo, (3) tocar clientes está
fuera de alcance. **No conectar Pro a respaldos sin esto.**

---

### Fase 1 — Seguridad (2026-09-30)

**Problema:** deploy público sin autenticación real; la clave admin
(`"24457713"`) viajaba quemada en el bundle del cliente y la sesión era un
objeto en `localStorage` con usuario pre-autenticado.

**Fix:**
- `src/lib/auth-actions.ts` (server actions): `loginAction` compara el email
  contra la allowlist y el SHA-256 del PIN de 6 dígitos contra
  `ADMIN_PIN_SHA256` (variable solo-servidor) con `timingSafeEqual`;
  emite cookie `em_session` httpOnly + SameSite=Lax (+Secure en prod).
  Throttle best-effort 10 intentos/10 min por email. Fail-closed si faltan
  las variables.
- `src/lib/session.ts` (server-only, Web Crypto): firma/verificación
  HMAC-SHA-256 de la cookie, expiración 12h. Funciona en Node y en Edge.
- `src/middleware.ts`: exige sesión válida en todas las rutas excepto
  `/login`, `/_next/*`, estáticos y **`/api/backup/*`** (los POS en campo no
  tienen cookie admin; esos endpoints mantienen su propio secreto
  `x-backup-secret` con 401 fail-closed).
- `src/app/login/page.tsx`: ruta de login. `auth-context.tsx` reescrito: ya
  no contiene claves ni hashes; `login()` llama a la server action.
- `src/app/page.tsx`: puerta de login reactivada (defensa en profundidad;
  el middleware es la puerta principal).
- Se conserva el alias con typo `luiggiberaldi94@gmial.com` como
  identificador de login (no recibe correo, no cuesta nada mantenerlo).

**Cambio 2026-09-30 (pedido de luigi):** la credencial pasó de contraseña a
PIN de 6 dígitos (valor acordado en el chat, no se registra aquí porque el
repo es público). `loginAction` ahora valida formato `/^\d{6}$/` y compara
`SHA-256(PIN)` contra `ADMIN_PIN_SHA256`. La vista de login muestra campo
PIN con teclado numérico. Ojo: el PIN quedó escrito en el historial del
chat — tratarlo como semi-público; para cambiarlo basta setear un nuevo
hash (`printf 'NUEVO-PIN' | sha256sum`).

**Variables a configurar en Vercel (producción) antes/durante el deploy:**
- `ADMIN_PIN_SHA256` = SHA-256 del PIN (valor pasado en el chat el 2026-09-30;
  para cambiar el PIN a futuro: `printf 'NUEVO-PIN' | sha256sum`).
- `ADMIN_SESSION_SECRET` = `openssl rand -hex 32`
- `ADMIN_EMAILS` (opcional; default: gmail + gmial).
Sin estas variables el login falla cerrado (nadie entra).

**QA:** `tsc` limpio, ESLint 0 errores, `next build` verde. Lógica
sign/verify probada con script node (firma válida, secreto ausente,
cookie ausente, tampering y secreto distinto → todos `null`). Prueba de
humo contra `next start` real (2026-09-30): `/` sin sesión → 307 a
`/login`; `/login` → 200 con el título; `/` con cookie válida → 200;
`/login` con sesión → 307 a `/`; `POST /api/backup/complete` sin secreto
→ 401 (su propio auth, no redirige al login: el flujo de los POS en campo
queda intacto).

**A3 pendiente (lo hace luigi):** rotar el token de Vercel y el token
personal de Supabase Management expuestos en el chat el 2026-09-29. El
asistente no puede rotarlos (viven en sus cuentas).

## Fase 7 — Deploy (2026-09-30, completada)

- Commit `b5e41f3` "fixeo general..." + `99ac38b` (redeploy vacío): 21
  archivos, rama `feat/producto-lite-pro` mergeada a `main` (fast-forward),
  push vía `git-push.py` (sin PIN ni hash en el repo: es público).
- Hallazgo: el push a GitHub disparaba deploys en OTRO proyecto Vercel
  (scope `luigis-projects`, sin el dominio); el dominio de producción vive en
  el proyecto del team `luiggi2` (`prj_0CZhkZPo07St4QJojq2uopl8rsDy`), que se
  despliega manual con `vercel --prod`. El deploy se hizo así.
- Variables seteadas en el proyecto (production+preview, type sensitive):
  `ADMIN_PIN_SHA256`, `ADMIN_SESSION_SECRET` (nuevo, `openssl rand -hex 32`).
- Verificación en producción: `/` sin sesión → 307 a `/login`; `/login` →
  200 con campo PIN; `POST /api/backup/complete` sin secreto → 401.
- El redeploy vacío se necesitó porque el primer push a main no movía el
  dominio (el edge seguía sirviendo el deploy manual anterior); con
  `vercel --prod` el dominio tomó el código nuevo de inmediato.
- Prueba de login real en producción (navegador, 2026-09-30): email + PIN →
  entra al panel sin errores; dashboard muestra Lite seleccionado, sidebar
  completo y KPIs (Total licencias 99, Demos activas 0, Ingreso histórico
  $320.00). Sesión activa como luiggiberaldi94@gmail.com.

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

## 2026-09-30 — Login solo con PIN (sin correo)

**Pidió luigi:** "quita el correo solo se ingresa con pin".

**Cambios:**
- `src/components/login-view.tsx`: eliminado el campo de correo electrónico; solo queda el campo PIN (con autoFocus ahora en el PIN).
- `src/lib/auth-actions.ts`: `loginAction(pin)` sin parámetro de email; eliminada la allowlist de correos (`ADMIN_EMAILS` deja de usarse). El throttle anti-fuerza-bruta (10 intentos / 10 min) ahora se aplica por IP (`x-forwarded-for`) en vez de por email. La sesión usa identidad fija `"admin"`.
- `src/lib/auth-context.tsx`: `login(pin)` con la nueva firma.
- Mensaje de error cambiado de "Credenciales incorrectas" a "PIN incorrecto".

**Verificación:** `npx tsc --noEmit` limpio, ESLint 0 errores, `npm run build` verde. Smoke test local con `next start`: `/login` sirve solo `id="pin"` (sin `id="email"`); `/` sin sesión sigue 307 a `/login`; `/api/backup/complete` sin secreto sigue 401.

## 2026-09-30 — Registro de visitas + centro de notificaciones

**Pidió luigi:** que toda persona que abra el link quede registrada, y notificaciones de nuevas demos más las que se consideren necesarias.

**Migración (PENDIENTE DE APLICAR por luigi):** `supabase/migrations/20260930_visits_notifications.sql` — tablas `visits` y `notifications` (RLS habilitado sin policies; la app usa service_role). No se pudo aplicar desde aquí: el credential supabase-mgmt da 403 `project_admin_read` en el proyecto Estación y PostgREST no ejecuta DDL. **Todo el código se degrada con elegancia si las tablas no existen** (devuelve [] / ceros / 200). Hasta que luigi pegue el SQL en el SQL editor del dashboard, visitas y notificaciones quedan dormidas.

**Visitas:**
- `src/app/api/track/route.ts`: POST público (exento en `src/middleware.ts` junto a `/api/backup/*`) que inserta path, IP (x-forwarded-for), user-agent, referer, país/ciudad (headers de Vercel), pantalla, idioma y zona horaria.
- `src/components/visit-tracker.tsx`: client component montado en `src/app/layout.tsx`; dispara un beacon por pathname (guard contra StrictMode).
- `src/lib/visits.ts`: `getVisits(limit)`, `getVisitStats()` (hoy en America/Caracas, UTC-4 fijo).
- Vista "Visitas" (`src/components/views/visits-view.tsx`): KPIs hoy/total + tabla (fecha Caracas, ruta, IP, ubicación, dispositivo parseado del UA). `parseDevice()` vive en `src/lib/utils.ts` porque un módulo `"use server"` no puede exportar funciones sync a client components (rompía el build).

**Notificaciones:**
- `src/lib/notifications.ts`: `notify()` con upsert idempotente en `(type, ref_id)`; `getNotifications()` (ejecuta primero el sweep), `getUnreadCount()`, `markAllRead()`, `markRead(id)`.
- `ensureEventNotifications()`: sin cron — corre al abrir notificaciones/campana. Genera: demo creada (hook inmediato en `createOrUpdateLicense` tras INSERT de tipo demo activo), demo por vencer ≤72h (Lite y Pro por separado, badge de producto), demo vencida (últimos 30 días), respaldo fallido (de `getFailedBackupRequests()`), dispositivo nuevo (account_devices últimos 7 días). Import dinámico de `./actions` para evitar ciclo con el hook de `createOrUpdateLicense`.
- UI: campana en el topbar de `admin-shell.tsx` con badge de no leídas (refresco cada 60s), dropdown con 8 recientes + "Ver todas"; vista "Notificaciones" con filtro todas/no leídas, marcar leída al clic, "hace X" en español, icono por tipo y badge Lite/Pro.
- Nuevos `AdminView`: `notifications`, `visits` (sidebar + `src/app/page.tsx`).

**Verificación:** `npx tsc --noEmit` limpio, ESLint 0 errores en archivos tocados, `npm run build` verde. Smoke con `next start`: POST /api/track → 200 sin sesión; /login → 200.

---

## 2026-09-30 — feat(mensajes): zona de Mensajes con plantillas por caso + teléfono en generar licencia

**Pedido de luigi:** una zona en la Estación para enviar mensajes con plantillas
automáticas para cada caso, usando los teléfonos de los clientes.

**Cambios:**
- `src/components/views/messages-view.tsx` (nuevo): vista "Mensajes".
  - Directorio de clientes (derivado de `getLicenses`, filtrado por producto
    Lite/Pro) con búsqueda por nombre, teléfono, código o equipo. Los clientes
    sin teléfono llevan marca ámbar "Sin teléfono".
  - 7 plantillas por caso: Licencia activada, Demo por vencer, Demo vencida,
    Mensualidad próxima a vencer, Pago pendiente, Pago recibido, Primer contacto.
  - **Sugerencia automática:** al elegir un cliente se preselecciona la plantilla
    según el estado real de su licencia (demo vencida, demo ≤3 días, mensualidad
    vencida, mensualidad ≤5 días, registro sin licencia, permanente).
  - Variables auto-rellenadas: `{nombre}`, `{codigo}`, `{licencia}`, `{vencimiento}`,
    `{dias}`, `{equipo}`. El texto es editable antes de enviar.
  - Botón "Enviar por WhatsApp" abre `wa.me/<tel>?text=...` con el número
    normalizado a formato internacional (58…). Botón "Copiar" como alternativa.
  - Sin teléfono → aviso y envío bloqueado.
- `src/components/admin-shell.tsx`: nueva entrada "Mensajes" (icono MessageSquare)
  entre Dispositivos y Notificaciones.
- `src/app/page.tsx`: render de `MessagesView`.
- `src/components/views/licenses-view.tsx`: el diálogo "Generar licencia" ahora
  pide **Teléfono** (junto a Alias y Cliente) y lo envía como `clientPhone` a
  `createOrUpdateLicense`, que ya lo persistía en `clients.phone` (línea 235 de
  `actions.ts`). Cierra el circuito: Lite → WhatsApp → Estación → Mensajes.
- `npx tsc --noEmit` verificado OK.

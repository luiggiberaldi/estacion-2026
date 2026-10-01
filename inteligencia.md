# inteligencia.md — La Estación 2026

Aprendizajes reutilizables.

- **Nunca mezclar Lite y Pro:** toda operación (licencias, reportes, respaldos)
  lleva producto explícito (`bodega` = Lite/original, `pro` = multilocal).
  Sin defaults silenciosos ni operaciones "todos los productos".
- **Fallo silencioso = deuda invisible:** un `.catch(() => null)` en el camino
  del respaldo dejó 41 solicitudes `pending` eternas con cero completadas.
  Los estados terminales (`failed` con motivo) son obligatorios en cualquier
  pipeline asíncrono; el éxito falso es peor que el error visible.
- **Migraciones tolerantes:** el código que consume una columna nueva debe
  funcionar antes y después de aplicarla (fallback sin la columna), porque el
  deploy del código y la migración no son atómicos.
- **No fabricar datos que la BD no tiene:** `platform:"android"` /
  `appVersion:"2.0.0"` hardcodeados pasaron por reales durante meses. Si el
  esquema no tiene la columna, el valor es desconocido (`null`/`"—"`), nunca
  un default verosímil. Un default verosímil es una mentira con buena
  presentación.
- **`updated_at` no es "última actividad":** cualquier UPDATE administrativo
  (revocación masiva, edición de notas) lo toca. Para "en línea" se necesita
  una señal del dispositivo (`last_seen`), no del operador.
- **Endurecer RLS sin romper clientes en campo:** antes de revocar un acceso
  que un cliente en producción usa (aunque sea como fallback), verificar todos
  los caminos de código del cliente desplegado. Si el cambio requiere release
  del cliente, la migración queda preparada y documentada, no aplicada a
  medias.
- **Discrepancias de conteo primero se investigan en BD:** el "65 vs 66" era el
  scoping por producto funcionando bien (una fila `product_id='test'`), no un
  bug de la vista. Contar por dimensiones (producto, estado) antes de tocar
  código.
- **Login admin: secreto solo-servidor + middleware:** la clave nunca va al
  bundle (ni siquiera hasheada del lado cliente); la sesión es una cookie
  httpOnly firmada con HMAC verificada en `middleware.ts`. Los endpoints que
  consumen dispositivos en campo (`/api/backup/*`) se excluyen del middleware
  porque tienen su propio secreto y no tienen sesión admin. Fail-closed: sin
  variables configuradas, nadie entra.
- **Metadata global del dispositivo vs estado por producto:** `cloud_licenses`
  (alias/negocio/email/teléfono) es del equipo, no de la licencia. Revocar o
  borrar una licencia de un producto no debe alterar la metadata del otro:
  el espejo `is_active` refleja si queda *alguna* licencia activa, y la fila
  solo se borra cuando el equipo no tiene licencias en ningún producto.
- **Circuito del teléfono del cliente (2026-09-30):** el teléfono se captura en el
  Lite (`business_phone` en localStorage, obligatorio desde el registro), viaja
  en el mensaje de WhatsApp de solicitud de licencia, y luigi lo carga en el
  campo Teléfono del diálogo "Generar licencia" → `clients.phone`. Es metadata
  del equipo (como alias/negocio/email), no de la licencia: disponible en todas
  las vistas y en la zona Mensajes. Los números se normalizan a formato
  internacional (58…) solo al construir el link `wa.me`.
- **Management API: SQL vía `/v1/projects/{ref}/database/query`** (POST con
  `{"query": "..."}`); el path `/v1/projects/{ref}/query` no existe (404).
  Requiere que el token pertenezca a la cuenta dueña del proyecto: un 403
  `project_admin_read`/`database_read` ante un `GET /v1/projects` que no lista
  el proyecto confirma cuenta equivocada, no token roto. Verificar siempre con
  `GET /v1/projects` primero.
- **Las migraciones viven en `docs/migrations/` aunque no se puedan aplicar
  todavía:** el archivo versionado + la nota del bloqueo en bitácora valen más
  que un DDL suelto en `/tmp`. El deploy del código y la migración no son
  atómicos (ver "Migraciones tolerantes" arriba).

## 2026-10-01 — Supabase Management API sí ejecuta SQL
- `POST /v1/projects/{ref}/database/query` con body `{"query": "..."}` ejecuta SQL arbitrario (DDL incluido); devuelve 201. Probado en el proyecto Estación.
- La bitácora decía que el endpoint no existía: era un problema de permisos del token viejo (403 en proyecto ajeno), no de inexistencia. `/v1/projects/{ref}/query` y `/sql` sí dan 404.
- Lección: ante un 404/403, probar el endpoint con un token que SÍ tenga acceso al proyecto antes de declararlo inexistente.

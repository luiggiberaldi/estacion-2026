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

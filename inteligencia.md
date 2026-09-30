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

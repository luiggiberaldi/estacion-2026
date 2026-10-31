import { NextResponse } from 'next/server';
import { corsHeadersFor, handleBackupOptions } from '../_lib/backup-auth';

/**
 * /api/backup/complete — RETIRADO (410 Gone). No escribe en la base.
 *
 * Motivo del retiro: este endpoint hacía upsert de `cloud_backups.backup_data`
 * con SOLO metadatos (size_bytes, product_count, sales_count, customer_count).
 * Esa columna es donde el POS guarda el payload COMPLETO del respaldo
 * (contrato BACKUP-001, ver src/hooks/useCloudBackup.js del POS), así que cada
 * llamada sobrescribía y destruía el respaldo real del dispositivo de forma
 * irreversible. Los metadatos resumen viven en columnas propias de
 * `cloud_backups` (supabase_backups_summary_columns.sql), jamás dentro de
 * `backup_data`.
 *
 * El POS actual ya no lo llama: `performBackup` sube por
 * `uploadCompressedBackupToCloud` (escritura directa en `cloud_backups` o
 * `/api/backup/relay`) y marca `backup_requests` como `completed` directamente
 * en Supabase. La ruta se conserva como lápida para los POS antiguos que aún la
 * llamen: reciben un error claro y accionable y no se toca ningún dato.
 *
 * NO reintroducir escritura aquí. Si vuelven a hacer falta metadatos de
 * respaldo, van en columnas propias, nunca en `backup_data`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return handleBackupOptions(req);
}

export async function POST(req: Request) {
  return NextResponse.json(
    {
      ok: false,
      error:
        'Endpoint retirado: /api/backup/complete ya no acepta metadatos porque sobrescribía el respaldo real del dispositivo. ' +
        'Sube el respaldo por /api/backup/storage/upload (con acuse verificado) o por /api/backup/relay.',
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        ...corsHeadersFor(req.headers.get('origin')),
      },
    }
  );
}

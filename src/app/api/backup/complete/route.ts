import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  verifyBackupSecret,
  unauthorized,
  corsHeadersFor,
  handleBackupOptions,
} from '../_lib/backup-auth';

export async function OPTIONS(req: Request) {
  return handleBackupOptions(req);
}

export async function POST(req: Request) {
  // Fail-closed: sin BACKUP_SHARED_SECRET configurado (o secreto inválido),
  // el endpoint rechaza todo. El POS envía el header x-backup-secret.
  if (!verifyBackupSecret(req)) return unauthorized();

  const cors = corsHeadersFor(req.headers.get('origin'));

  try {
    const body = await req.json();
    const { deviceId, driveUrl, sizeBytes, productCount, salesCount, customerCount } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'Falta el ID del dispositivo' }, { status: 400, headers: cors });
    }

    const cleanId = String(deviceId).replace(/\s+/g, '').toUpperCase();
    const admin = getSupabaseAdmin();

    const metadataPayload = {
      drive_url: driveUrl || null,
      size_bytes: sizeBytes || 0,
      product_count: productCount || 0,
      sales_count: salesCount || 0,
      customer_count: customerCount || 0,
      updated_at: new Date().toISOString()
    };

    // 1. Guardar en cloud_backups usando service_role key (bypassea RLS)
    const { error: bkpErr } = await admin.from('cloud_backups').upsert({
      device_id: cleanId,
      backup_data: metadataPayload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'device_id' });

    if (bkpErr) {
      console.error('[API Backup Complete] Error al guardar en cloud_backups:', bkpErr);
      return NextResponse.json({ error: bkpErr.message }, { status: 500, headers: cors });
    }

    // 2. Marcar la solicitud como completada en backup_requests
    await admin.from('backup_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('device_id', cleanId);

    return NextResponse.json({ success: true, deviceId: cleanId }, { headers: cors });
  } catch (err: any) {
    console.error('[API Backup Complete] Error grave:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500, headers: cors });
  }
}

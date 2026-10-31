// tests/backup-entitlement.test.ts
//
// Cobertura de src/lib/backup-entitlement.ts (decisión pura, sin I/O):
// normalización de device ids y elegibilidad para respaldo remoto.
//
// Casos: éxito, cada motivo de rechazo y sus límites.

import { describe, expect, it } from 'vitest';

import {
  BACKUP_PRODUCT_ID,
  evaluateBackupEntitlement,
  normalizeDeviceId,
  type LicenseRow,
} from '@/lib/backup-entitlement';

const DEVICE = 'PDA-DEVICE-01';
const NOW = new Date('2026-10-19T12:00:00.000Z');

const row = (overrides: Partial<LicenseRow> = {}): LicenseRow => ({
  product_id: BACKUP_PRODUCT_ID,
  device_id: DEVICE,
  type: 'permanent',
  is_active: true,
  expires_at: null,
  ...overrides,
});

describe('normalizeDeviceId', () => {
  it('quita espacios y pasa a mayúsculas', () => {
    expect(normalizeDeviceId('  pda device 01  ')).toBe('PDADEVICE01');
  });

  it('acepta un id en mayúsculas tal cual', () => {
    expect(normalizeDeviceId('PDA-DEVICE-01')).toBe('PDA-DEVICE-01');
  });

  it('devuelve null para un id demasiado corto (7 caracteres)', () => {
    expect(normalizeDeviceId('1234567')).toBeNull();
  });

  it('acepta el mínimo exacto (8 caracteres)', () => {
    expect(normalizeDeviceId('12345678')).toBe('12345678');
  });

  it('acepta el máximo exacto (64 caracteres)', () => {
    expect(normalizeDeviceId('a'.repeat(64))).toBe('A'.repeat(64));
  });

  it('rechaza por encima del máximo (65 caracteres)', () => {
    expect(normalizeDeviceId('a'.repeat(65))).toBeNull();
  });

  it('rechaza vacío y solo espacios', () => {
    expect(normalizeDeviceId('')).toBeNull();
    expect(normalizeDeviceId('   ')).toBeNull();
  });
});

describe('evaluateBackupEntitlement · elegibilidad', () => {
  it('acepta una licencia permanente activa sin vencimiento', () => {
    expect(evaluateBackupEntitlement(row(), DEVICE, NOW)).toEqual({ ok: true, deviceId: DEVICE });
  });

  it('acepta una licencia mensual activa con vencimiento futuro', () => {
    expect(evaluateBackupEntitlement(row({ type: 'monthly', expires_at: '2026-10-25T12:00:00Z' }), DEVICE, NOW))
      .toEqual({ ok: true, deviceId: DEVICE });
  });

  it('una mensual en período de gracia conserva el respaldo (5 días)', () => {
    expect(evaluateBackupEntitlement(row({ type: 'monthly', expires_at: '2026-10-17T12:00:00Z' }), DEVICE, NOW))
      .toEqual({ ok: true, deviceId: DEVICE });
  });

  it('una mensual ya muerta (más allá de la gracia) pierde el respaldo', () => {
    expect(evaluateBackupEntitlement(row({ type: 'monthly', expires_at: '2026-10-12T12:00:00Z' }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'expired' });
  });

  it('una mensual sin vencimiento no es premium para siempre (fail-closed)', () => {
    expect(evaluateBackupEntitlement(row({ type: 'monthly', expires_at: null }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'expired' });
  });

  it('acepta licencia activa con vencimiento futuro', () => {
    expect(evaluateBackupEntitlement(row({ expires_at: '2026-10-20T00:00:00Z' }), DEVICE, NOW))
      .toEqual({ ok: true, deviceId: DEVICE });
  });

  it('fail-closed: sin fila → no_license', () => {
    expect(evaluateBackupEntitlement(null, DEVICE, NOW)).toEqual({ ok: false, reason: 'no_license' });
    expect(evaluateBackupEntitlement(undefined, DEVICE, NOW)).toEqual({ ok: false, reason: 'no_license' });
  });

  it('producto distinto de "bodega" → wrong_product', () => {
    expect(evaluateBackupEntitlement(row({ product_id: 'otro' }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'wrong_product' });
  });

  it('sin device_id en la fila → no_license', () => {
    expect(evaluateBackupEntitlement(row({ device_id: null }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'no_license' });
  });

  it('device_id de OTRO equipo → no_license (no se acepta prestado)', () => {
    expect(evaluateBackupEntitlement(row({ device_id: 'PDA-DEVICE-99' }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'no_license' });
  });

  it('compara el device_id normalizado: espacios y mayúsculas no cambian el resultado', () => {
    expect(evaluateBackupEntitlement(row({ device_id: '  pda-device-01 ' }), DEVICE, NOW))
      .toEqual({ ok: true, deviceId: DEVICE });
  });

  it('falla si el device_id normalizado no coincide con el pedido', () => {
    expect(evaluateBackupEntitlement(row({ device_id: 'PDA-DEVICE-01' }), 'PDA-DEVICE-01X', NOW))
      .toEqual({ ok: false, reason: 'no_license' });
  });

  it.each(['demo3', 'demo7', 'revoked', 'registered'] as const)(
    'tipo %s no es elegible → not_eligible',
    (type) => {
      expect(evaluateBackupEntitlement(row({ type }), DEVICE, NOW))
        .toEqual({ ok: false, reason: 'not_eligible' });
    }
  );

  it('is_active false → inactive', () => {
    expect(evaluateBackupEntitlement(row({ is_active: false }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'inactive' });
  });

  it('is_active que no es boolean true → inactive (fail-closed)', () => {
    const dirty = row({ is_active: undefined as unknown as boolean });
    expect(evaluateBackupEntitlement(dirty, DEVICE, NOW))
      .toEqual({ ok: false, reason: 'inactive' });
  });

  it('vencida ayer → expired', () => {
    expect(evaluateBackupEntitlement(row({ expires_at: '2026-10-18T11:59:59Z' }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'expired' });
  });

  it('límite: el instante exacto de vencimiento cuenta como expirada', () => {
    expect(evaluateBackupEntitlement(row({ expires_at: NOW.toISOString() }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'expired' });
  });

  it('límite: un milisegundo antes del vencimiento sigue viva', () => {
    const expiresAt = new Date(NOW.getTime() + 1).toISOString();
    expect(evaluateBackupEntitlement(row({ expires_at: expiresAt }), DEVICE, NOW))
      .toEqual({ ok: true, deviceId: DEVICE });
  });

  it('un expires_at ilegible corta el acceso (fail-closed)', () => {
    // Política (licensePolicy.js): una fecha corrupta no puede interpretarse
    // como "sin vencimiento", porque eso daría acceso indefinido por un dato
    // roto. Solo un null explícito significa "sin vencimiento".
    expect(evaluateBackupEntitlement(row({ expires_at: 'no-es-fecha' }), DEVICE, NOW))
      .toEqual({ ok: false, reason: 'expired' });
  });

  it('el orden de evaluación es producto → dispositivo → tipo → actividad → vencimiento', () => {
    // Si todo falla a la vez, el motivo devuelto es el primero de la cadena.
    const todoMal = row({
      product_id: 'otro',
      device_id: 'PDA-DEVICE-99',
      type: 'demo3',
      is_active: false,
      expires_at: '2020-01-01T00:00:00Z',
    });
    expect(evaluateBackupEntitlement(todoMal, DEVICE, NOW))
      .toEqual({ ok: false, reason: 'wrong_product' });
  });
});

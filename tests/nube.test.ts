// tests/nube.test.ts
//
// Estación 3.0 · Precios al Día Nube: reconocer IDs PDN-, armar la ficha de cada
// cuenta (licencia, sedes, usuarios, equipos conectados) y validar la licencia.

import { describe, expect, it } from 'vitest';

import { classifyDeviceId, isNubeDeviceId, looksLikeNubeId, normalizeDeviceId } from '@/lib/nube-id';
import { buildNubeAccounts, nubeLicenseState, validateNubeLicenseInput, type NubeRawData } from '@/lib/nube-model';

const PDN = 'PDN-' + 'A1B2C3D4'.repeat(4);
const NOW = Date.parse('2026-11-16T12:00:00Z');

describe('IDs de la Nube', () => {
  it('reconoce un PDN- completo aunque venga en minúsculas o con espacios', () => {
    expect(isNubeDeviceId(PDN)).toBe(true);
    expect(isNubeDeviceId(` ${PDN.toLowerCase()} `)).toBe(true);
    expect(normalizeDeviceId(' pdn-ab ')).toBe('PDN-AB');
  });

  it('no confunde los IDs de Bodega/Farmacia ni acepta PDN- incompletos', () => {
    expect(isNubeDeviceId('PDA-12345678')).toBe(false);
    expect(isNubeDeviceId('PDN-1234')).toBe(false);
    expect(looksLikeNubeId('PDN-1234')).toBe(true);
    expect(classifyDeviceId('PDA-12345678')).toBe('clasico');
    expect(classifyDeviceId(PDN)).toBe('nube');
    expect(classifyDeviceId('')).toBe('desconocido');
  });
});

describe('estado de la licencia', () => {
  it('suspendida y vencida ganan a prueba/activa', () => {
    expect(nubeLicenseState(null, NOW)).toBe('sin_licencia');
    expect(nubeLicenseState({ status: 'trial', expires_at: '2026-12-01T00:00:00Z' }, NOW)).toBe('prueba');
    expect(nubeLicenseState({ status: 'active', expires_at: null }, NOW)).toBe('activa');
    expect(nubeLicenseState({ status: 'active', expires_at: '2026-11-01T00:00:00Z' }, NOW)).toBe('vencida');
    expect(nubeLicenseState({ status: 'suspended', expires_at: null }, NOW)).toBe('suspendida');
  });
});

function raw(): NubeRawData {
  const acc = '11111111-1111-1111-1111-111111111111';
  return {
    accounts: [{ id: acc, name: 'Bodega Juancho', owner_user_id: 'u-owner', created_at: '2026-11-10T00:00:00Z' }],
    licenses: [
      { account_id: acc, status: 'trial', max_cajas: 2, max_sedes: 1, expires_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-10T00:00:00Z' },
    ],
    sedes: [{ id: 's1', account_id: acc, name: 'Principal', created_at: '2026-11-10T00:00:00Z', archived_at: null }],
    members: [
      { id: 'm2', account_id: acc, display_name: 'Ana', role: 'cajero', active: true, locked_until: '2026-11-16T12:05:00Z', created_at: '2026-11-11T00:00:00Z' },
      { id: 'm1', account_id: acc, display_name: 'Juancho', role: 'dueno', active: true, locked_until: null, created_at: '2026-11-10T00:00:00Z' },
    ],
    devices: [
      { id: PDN, account_id: acc, sede_id: 's1', role: 'caja', caja_letter: 'A', label: 'Caja mostrador', created_at: '2026-11-10T00:00:00Z', last_seen_at: '2026-11-15T00:00:00Z', revoked_at: null },
      { id: 'PDN-' + 'F'.repeat(32), account_id: acc, sede_id: 's1', role: 'consulta', caja_letter: null, label: 'Teléfono', created_at: '2026-11-11T00:00:00Z', last_seen_at: '2026-11-16T11:55:00Z', revoked_at: null },
      { id: 'PDN-' + 'E'.repeat(32), account_id: acc, sede_id: 's1', role: 'caja', caja_letter: 'B', label: 'Vieja', created_at: '2026-11-09T00:00:00Z', last_seen_at: null, revoked_at: '2026-11-12T00:00:00Z' },
    ],
    sessions: [
      { member_id: 'm2', device_id: PDN, created_at: '2026-11-16T08:00:00Z', expires_at: '2026-11-16T20:00:00Z', ended_at: null },
      { member_id: 'm1', device_id: PDN, created_at: '2026-11-15T08:00:00Z', expires_at: '2026-11-15T20:00:00Z', ended_at: null },
    ],
    // Ya agregado por la RPC estacion_device_sales_stats (sin anuladas); bigint llega como texto.
    salesStats: [
      { device_id: PDN, sales_count: '1', last_sale_at: '2026-11-16T09:00:00Z' },
    ],
    owners: [{ id: 'u-owner', email: 'juancho@ejemplo.com', email_confirmed_at: '2026-11-10T00:00:00Z', last_sign_in_at: null }],
  };
}

describe('ficha de cada cuenta', () => {
  const [a] = buildNubeAccounts(raw(), NOW);

  it('trae dueño, licencia, sedes y usuarios (dueño primero, bloqueo visible)', () => {
    expect(a.ownerEmail).toBe('juancho@ejemplo.com');
    expect(a.license).toMatchObject({ state: 'prueba', maxCajas: 2, maxSedes: 1 });
    expect(a.sedes.map((s) => s.name)).toEqual(['Principal']);
    expect(a.members.map((m) => m.name)).toEqual(['Juancho', 'Ana']);
    expect(a.members[1].locked).toBe(true);
  });

  it('equipos: conectado por sesión de PIN abierta o visto hace poco; el expulsado al final', () => {
    expect(a.devices.map((d) => d.label)).toEqual(['Caja mostrador', 'Teléfono', 'Vieja']);
    const [caja, tel, vieja] = a.devices;
    expect(caja.isOnline).toBe(true);
    expect(caja.openSessions).toEqual(['Ana']); // la sesión vencida de Juancho no cuenta
    expect(caja.sedeName).toBe('Principal');
    expect(tel.isOnline).toBe(true);
    expect(vieja.isOnline).toBe(false);
    expect(a.cajasEnUso).toBe(1);
    expect(a.equiposConectados).toBe(2);
  });

  it('usa los conteos agregados de ventas por equipo', () => {
    expect(a.devices[0].salesCount).toBe(1);
    expect(a.devices[1].salesCount).toBe(0);
    expect(a.salesCount).toBe(1);
    expect(a.lastSaleAt).toBe('2026-11-16T09:00:00Z');
  });

  it('más de 1000 ventas en un equipo se cuentan completas', () => {
    const r = raw();
    r.salesStats = [
      { device_id: PDN, sales_count: '2500', last_sale_at: '2026-11-16T09:00:00Z' },
      { device_id: 'PDN-' + 'F'.repeat(32), sales_count: 7, last_sale_at: '2026-11-16T11:00:00Z' },
    ];
    const [acc] = buildNubeAccounts(r, NOW);
    expect(acc.devices[0].salesCount).toBe(2500);
    expect(acc.salesCount).toBe(2507);
    expect(acc.lastSaleAt).toBe('2026-11-16T11:00:00Z');
  });
});

describe('validar licencia que llega del navegador', () => {
  it('acepta valores válidos y normaliza la fecha', () => {
    expect(validateNubeLicenseInput({ status: 'active', maxCajas: 3, maxSedes: 2, expiresAt: '2026-12-31T23:59:59-04:00' })).toEqual({
      status: 'active',
      maxCajas: 3,
      maxSedes: 2,
      expiresAt: '2027-01-01T03:59:59.000Z',
    });
    expect(validateNubeLicenseInput({ status: 'trial', maxCajas: 0, maxSedes: 1, expiresAt: '' }).expiresAt).toBeNull();
  });

  it('rechaza lo que la base también rechazaría', () => {
    expect(() => validateNubeLicenseInput({ status: 'gratis', maxCajas: 1, maxSedes: 1 })).toThrow();
    expect(() => validateNubeLicenseInput({ status: 'active', maxCajas: 101, maxSedes: 1 })).toThrow();
    expect(() => validateNubeLicenseInput({ status: 'active', maxCajas: 1, maxSedes: 0 })).toThrow();
    expect(() => validateNubeLicenseInput({ status: 'active', maxCajas: 1.5, maxSedes: 1 })).toThrow();
    expect(() => validateNubeLicenseInput({ status: 'active', maxCajas: 1, maxSedes: 1, expiresAt: 'mañana' })).toThrow();
  });
});

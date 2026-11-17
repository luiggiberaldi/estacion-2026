import { describe, expect, it } from 'vitest';
import {
  CLAIM_CODE_ALPHABET,
  CLAIM_CODE_LENGTH,
  formatClaimCode,
  generateClaimCode,
  hashClaimCode,
  normalizeClaimCode,
} from '@/lib/device-claim';
import { claimDeviceCredential, type ClaimDeps } from '@/lib/device-claim-service';
import { authorizeRelay } from '@/lib/relay-auth';
import { hashDeviceCredential } from '@/lib/device-credential';
import type { LicenseRow } from '@/lib/backup-entitlement';

const DEV = 'PDA-AAAA1111BBBB2222CCCC3333DDDD';
const OTHER = 'PDA-ZZZZ9999YYYY8888XXXX7777WWWW';
const NOW = new Date('2026-11-16T12:00:00Z');
const paid = (deviceId = DEV): LicenseRow => ({ product_id: 'bodega', device_id: deviceId, type: 'permanent', is_active: true, expires_at: null });

describe('códigos de vinculación', () => {
  it('genera 8 caracteres del alfabeto sin confusiones', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateClaimCode();
      expect(c).toHaveLength(CLAIM_CODE_LENGTH);
      for (const ch of c) expect(CLAIM_CODE_ALPHABET).toContain(ch);
    }
    expect(CLAIM_CODE_ALPHABET).not.toMatch(/[01OILU]/);
  });

  it('normaliza guion, espacios y minúsculas; rechaza basura', () => {
    expect(normalizeClaimCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeClaimCode(' AB CD EF GH ')).toBe('ABCDEFGH');
    expect(normalizeClaimCode(formatClaimCode('ABCDEFGH'))).toBe('ABCDEFGH');
    expect(normalizeClaimCode('ABCDEFG')).toBeNull();      // corto
    expect(normalizeClaimCode('ABCDEFG0')).toBeNull();     // 0 no está en el alfabeto
    expect(normalizeClaimCode(null)).toBeNull();
  });

  it('el hash es estable y distinto del código', () => {
    expect(hashClaimCode('ABCDEFGH')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClaimCode('ABCDEFGH')).toBe(hashClaimCode('ABCDEFGH'));
    expect(hashClaimCode('ABCDEFGH')).not.toBe(hashClaimCode('ABCDEFGJ'));
  });
});

/** Base falsa en memoria para el canje. */
function fakeClaimDeps(opts: { claims?: Array<{ code: string; deviceId: string; expiresAt: Date }>; license?: LicenseRow | null; failures?: { byIp: number; byDevice: number } } = {}) {
  const claims = new Map((opts.claims ?? []).map((c) => [hashClaimCode(c.code), { ...c, used: false }]));
  const saved: Record<string, string> = {};
  const failures: Array<{ ip: string; deviceId: string | null }> = [];
  const deps: ClaimDeps = {
    now: () => NOW,
    countFailures: async () => opts.failures ?? { byIp: 0, byDevice: 0 },
    recordFailure: async (ip, deviceId) => { failures.push({ ip, deviceId }); },
    consumeClaim: async (hash, deviceId, now) => {
      const c = claims.get(hash);
      if (!c || c.used || c.deviceId !== deviceId || c.expiresAt <= now) return false;
      c.used = true;
      return true;
    },
    getLicense: async () => (opts.license === undefined ? paid() : opts.license),
    saveCredentialHash: async (deviceId, hash) => { saved[deviceId] = hash; },
  };
  return { deps, saved, failures };
}

describe('canje de código por credencial', () => {
  const valid = { code: 'ABCDEFGH', deviceId: DEV, expiresAt: new Date(NOW.getTime() + 60_000) };

  it('código correcto → credencial nueva; solo se guarda su hash', async () => {
    const { deps, saved } = fakeClaimDeps({ claims: [valid] });
    const r = await claimDeviceCredential({ deviceId: DEV.toLowerCase(), code: 'abcd-efgh', ip: '1.1.1.1' }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.credential.length).toBeGreaterThanOrEqual(40);
    expect(saved[DEV]).toBe(hashDeviceCredential(r.credential));
    expect(saved[DEV]).not.toBe(r.credential);
  });

  it('un código solo sirve una vez', async () => {
    const { deps } = fakeClaimDeps({ claims: [valid] });
    expect((await claimDeviceCredential({ deviceId: DEV, code: 'ABCDEFGH', ip: 'x' }, deps)).ok).toBe(true);
    const again = await claimDeviceCredential({ deviceId: DEV, code: 'ABCDEFGH', ip: 'x' }, deps);
    expect(again).toMatchObject({ ok: false, status: 401 });
  });

  it('código de otro equipo, vencido, inventado o mal formado → 401 y se anota el fallo', async () => {
    const expired = { ...valid, code: 'BBBBBBBB', expiresAt: new Date(NOW.getTime() - 1) };
    const { deps, failures } = fakeClaimDeps({ claims: [valid, expired] });
    expect(await claimDeviceCredential({ deviceId: OTHER, code: 'ABCDEFGH', ip: 'x' }, deps)).toMatchObject({ status: 401 });
    expect(await claimDeviceCredential({ deviceId: DEV, code: 'BBBBBBBB', ip: 'x' }, deps)).toMatchObject({ status: 401 });
    expect(await claimDeviceCredential({ deviceId: DEV, code: 'CCCCCCCC', ip: 'x' }, deps)).toMatchObject({ status: 401 });
    expect(await claimDeviceCredential({ deviceId: DEV, code: '123', ip: 'x' }, deps)).toMatchObject({ status: 401 });
    expect(failures).toHaveLength(4);
  });

  it('freno: con 5 fallos recientes ni siquiera mira el código', async () => {
    const { deps } = fakeClaimDeps({ claims: [valid], failures: { byIp: 5, byDevice: 0 } });
    expect(await claimDeviceCredential({ deviceId: DEV, code: 'ABCDEFGH', ip: 'x' }, deps)).toMatchObject({ status: 429 });
    const { deps: d2 } = fakeClaimDeps({ claims: [valid], failures: { byIp: 0, byDevice: 5 } });
    expect(await claimDeviceCredential({ deviceId: DEV, code: 'ABCDEFGH', ip: 'x' }, d2)).toMatchObject({ status: 429 });
  });

  it('sin licencia de respaldo vigente → 403 y no guarda credencial', async () => {
    const demo: LicenseRow = { ...paid(), type: 'demo3' as LicenseRow['type'], expires_at: '2026-12-01T00:00:00Z' };
    const { deps, saved } = fakeClaimDeps({ claims: [valid], license: demo });
    expect(await claimDeviceCredential({ deviceId: DEV, code: 'ABCDEFGH', ip: 'x' }, deps)).toMatchObject({ status: 403 });
    expect(saved[DEV]).toBeUndefined();
  });

  it('deviceId inválido → 400', async () => {
    const { deps } = fakeClaimDeps();
    expect(await claimDeviceCredential({ deviceId: 'corto', code: 'ABCDEFGH', ip: 'x' }, deps)).toMatchObject({ status: 400 });
  });
});

describe('autorización del relay', () => {
  const secret = 'credencial-de-prueba-suficientemente-larga-123';
  const store = (map: Record<string, string>) => ({ getActiveHash: async (id: string) => map[id] ?? null });

  it('credencial correcta + licencia de pago → pasa', async () => {
    const r = await authorizeRelay({ deviceId: DEV, credential: secret }, { store: store({ [DEV]: hashDeviceCredential(secret) }), getLicense: async () => paid() });
    expect(r).toEqual({ ok: true, deviceId: DEV });
  });

  it('sin credencial (solo el secreto viejo) → 401', async () => {
    const r = await authorizeRelay({ deviceId: DEV, credential: null }, { store: store({ [DEV]: hashDeviceCredential(secret) }), getLicense: async () => paid() });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('credencial de OTRO equipo → 401', async () => {
    const r = await authorizeRelay({ deviceId: OTHER, credential: secret }, { store: store({ [DEV]: hashDeviceCredential(secret) }), getLicense: async () => paid(OTHER) });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('credencial revocada (sin hash activo) → 401', async () => {
    const r = await authorizeRelay({ deviceId: DEV, credential: secret }, { store: store({}), getLicense: async () => paid() });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('credencial correcta pero licencia vencida o inexistente → 403', async () => {
    const r = await authorizeRelay({ deviceId: DEV, credential: secret }, { store: store({ [DEV]: hashDeviceCredential(secret) }), getLicense: async () => null });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it('fallo al leer la licencia → 502 (no deja pasar)', async () => {
    const r = await authorizeRelay({ deviceId: DEV, credential: secret }, { store: store({ [DEV]: hashDeviceCredential(secret) }), getLicense: async () => { throw new Error('caída'); } });
    expect(r).toMatchObject({ ok: false, status: 502 });
  });

  it('deviceId inválido → 400', async () => {
    const r = await authorizeRelay({ deviceId: 123, credential: secret }, { store: store({}), getLicense: async () => paid() });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
});

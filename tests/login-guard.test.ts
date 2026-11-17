// F5 (M1): el tope global de fallos de PIN no deja fuera al admin desde su
// equipo conocido; el tope por IP se aplica siempre.

import { describe, expect, it, vi } from 'vitest';

// supabase.ts crea el cliente al importarse; aquí siempre se pasa un cliente falso.
vi.mock('../src/lib/supabase', () => ({ getSupabaseAdmin: () => { throw new Error('no usar en pruebas'); } }));
import { signSession, signTrusted, verifySession, verifyTrusted, trustedCookieName, trustedMaxAgeSeconds } from '../src/lib/session';
import { isLoginBlocked, MAX_FAILURES_GLOBAL, MAX_FAILURES_PER_IP } from '../src/lib/settings-store';
import { isBreakglassIp } from '../src/lib/login-guard';

const SECRET = 'secreto-de-prueba-0123456789abcdef';

describe('cookie em_trusted', () => {
  it('se firma y verifica con la versión de PIN vigente', async () => {
    const c = await signTrusted(SECRET, 3);
    expect(await verifyTrusted(c, SECRET, 3)).toBe(true);
    expect(trustedCookieName()).toBe('em_trusted');
    expect(trustedMaxAgeSeconds()).toBe(90 * 24 * 3600);
  });

  it('con otra versión de PIN se rechaza (cambiar el PIN la invalida)', async () => {
    const c = await signTrusted(SECRET, 3);
    expect(await verifyTrusted(c, SECRET, 4)).toBe(false);
  });

  it('vencida se rechaza', async () => {
    const c = await signTrusted(SECRET, 0, Date.now() - 91 * 24 * 3600 * 1000);
    expect(await verifyTrusted(c, SECRET, 0)).toBe(false);
  });

  it('otro secreto, firma alterada o basura se rechazan', async () => {
    const c = await signTrusted(SECRET, 0);
    expect(await verifyTrusted(c, 'otro-secreto', 0)).toBe(false);
    expect(await verifyTrusted(c.slice(0, -2) + 'xx', SECRET, 0)).toBe(false);
    expect(await verifyTrusted('a.b', SECRET, 0)).toBe(false);
    expect(await verifyTrusted(undefined, SECRET, 0)).toBe(false);
    expect(await verifyTrusted(c, undefined, 0)).toBe(false);
  });

  it('una em_session no vale como em_trusted', async () => {
    const s = await signSession('admin', SECRET, 0);
    expect(await verifyTrusted(s, SECRET, 0)).toBe(false);
  });

  it('una em_trusted no vale como em_session', async () => {
    const t = await signTrusted(SECRET, 0);
    expect(await verifySession(t, SECRET)).toBeNull();
  });
});

/** Cliente falso de station_login_failures: devuelve conteos fijos. */
function fakeDb(perIp: number, global: number) {
  const calls: string[] = [];
  const db = {
    from() {
      return {
        select() {
          const q: any = {
            filters: [] as string[],
            eq(col: string) { q.filters.push(col); return q; },
            gte() {
              const kind = q.filters.includes('ip') ? 'ip' : 'global';
              calls.push(kind);
              return Promise.resolve({ count: kind === 'ip' ? perIp : global, error: null });
            },
          };
          return q;
        },
      };
    },
  };
  return { db: db as any, calls };
}

describe('isLoginBlocked', () => {
  it(`${MAX_FAILURES_GLOBAL} fallos globales: bloqueado sin cookie, libre con ella`, async () => {
    const f = fakeDb(0, MAX_FAILURES_GLOBAL);
    expect(await isLoginBlocked('1.2.3.4', {}, f.db)).toBe(true);
    expect(await isLoginBlocked('1.2.3.4', { skipGlobal: true }, f.db)).toBe(false);
  });

  it(`${MAX_FAILURES_PER_IP} fallos de la misma IP: bloqueado incluso con cookie`, async () => {
    const f = fakeDb(MAX_FAILURES_PER_IP, 0);
    expect(await isLoginBlocked('1.2.3.4', { skipGlobal: true }, f.db)).toBe(true);
    expect(await isLoginBlocked('1.2.3.4', {}, f.db)).toBe(true);
  });

  it('con skipGlobal ni siquiera consulta el total', async () => {
    const f = fakeDb(0, 999);
    await isLoginBlocked('1.2.3.4', { skipGlobal: true }, f.db);
    expect(f.calls).toEqual(['ip']);
  });

  it('por debajo de los topes: libre', async () => {
    const f = fakeDb(MAX_FAILURES_PER_IP - 1, MAX_FAILURES_GLOBAL - 1);
    expect(await isLoginBlocked('1.2.3.4', {}, f.db)).toBe(false);
  });

  it('si la tabla falla devuelve null (queda el freno en memoria)', async () => {
    const db: any = { from: () => ({ select: () => ({ eq: () => ({ gte: () => Promise.resolve({ count: null, error: { message: 'no existe' } }) }) }) }) };
    expect(await isLoginBlocked('1.2.3.4', {}, db)).toBeNull();
  });
});

describe('ADMIN_BREAKGLASS_IPS', () => {
  it('coincidencia exacta en la lista', () => {
    expect(isBreakglassIp('200.1.2.3', '10.0.0.1, 200.1.2.3')).toBe(true);
    expect(isBreakglassIp('200.1.2.30', '200.1.2.3')).toBe(false);
  });
  it('vacía, sin definir o IP desconocida: nadie', () => {
    expect(isBreakglassIp('200.1.2.3', '')).toBe(false);
    expect(isBreakglassIp('200.1.2.3', undefined)).toBe(false);
    expect(isBreakglassIp('unknown', 'unknown')).toBe(false);
  });
});

// tests/session.test.ts
//
// Cobertura de src/lib/session.ts (cookie de sesión admin firmada con
// HMAC-SHA256 sobre Web Crypto): emisión, verificación, expiración y
// rechazo de cualquier manipulación.
//
// Casos: éxito, manipulación y casos límite.

import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  sessionCookieName,
  sessionMaxAgeSeconds,
  signSession,
  verifySession,
} from '@/lib/session';

const SECRET = 'secreto-de-sesion-muy-largo-y-aleatorio-1234567890';
const OTHER_SECRET = 'otro-secreto-completamente-distinto-0987654321';
const EMAIL = 'admin';

// Vuelve a firmar un payload arbitrario con el formato documentado de la
// cookie (`base64url(payload).base64url(firma)`) para poder probar cookies
// que signSession no llega a producir (payload incompleto, sin JSON, etc.).
function craftCookie(secret: string, payloadText: string): string {
  const b64url = (buf: Buffer): string => buf.toString('base64url');
  const payloadB64 = b64url(Buffer.from(payloadText, 'utf8'));
  const sigB64 = b64url(createHmac('sha256', secret).update(payloadB64).digest());
  return `${payloadB64}.${sigB64}`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('identidad de la cookie', () => {
  it('el nombre de la cookie es estable (el middleware depende de él)', () => {
    expect(sessionCookieName()).toBe('em_session');
  });

  it('la vida útil es de 12 horas', () => {
    expect(sessionMaxAgeSeconds()).toBe(12 * 60 * 60);
  });
});

describe('signSession → verifySession', () => {
  it('emite una cookie en el formato payload.firma y la verifica', async () => {
    const cookie = await signSession(EMAIL, SECRET);

    expect(cookie.split('.')).toHaveLength(2);
    expect(await verifySession(cookie, SECRET)).toBe(EMAIL);
  });

  it('el payload solo lleva email y expiración: dos emisiones en el mismo ms coinciden', async () => {
    // La cookie es determinista (HMAC sobre el payload), y el payload solo tiene
    // { e, x }: emitir dos veces en el mismo milisegundo produce la misma cadena.
    const fixed = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(fixed);
    const first = await signSession(EMAIL, SECRET);
    const second = await signSession(EMAIL, SECRET);
    expect(first).toBe(second);
    await expect(verifySession(first, SECRET)).resolves.toBe(EMAIL);
  });

  it('emisiones en instantes distintos producen cookies distintas', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const first = await signSession(EMAIL, SECRET);
    nowSpy.mockReturnValue(1_000_001);
    const second = await signSession(EMAIL, SECRET);
    expect(first).not.toBe(second);
    await expect(verifySession(second, SECRET)).resolves.toBe(EMAIL);
  });

  it('conserva el email tal cual se emitió', async () => {
    const cookie = await signSession('otro-admin', SECRET);
    expect(await verifySession(cookie, SECRET)).toBe('otro-admin');
  });
});

describe('expiración', () => {
  it('una sesión recién emitida es válida', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const cookie = await signSession(EMAIL, SECRET);
    expect(await verifySession(cookie, SECRET)).toBe(EMAIL);
  });

  it('sigue válida justo antes de cumplir la vida útil', async () => {
    const issuedAt = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(issuedAt);
    const cookie = await signSession(EMAIL, SECRET);

    vi.spyOn(Date, 'now').mockReturnValue(issuedAt + sessionMaxAgeSeconds() * 1000 - 1);
    expect(await verifySession(cookie, SECRET)).toBe(EMAIL);
  });

  it('expira al pasar la vida útil (el corte es estricto)', async () => {
    const issuedAt = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(issuedAt);
    const cookie = await signSession(EMAIL, SECRET);

    // La verificación usa `Date.now() > payload.x`, así que justo en el instante
    // de expiración la cookie sigue viva y muere un milisegundo después.
    vi.spyOn(Date, 'now').mockReturnValue(issuedAt + sessionMaxAgeSeconds() * 1000 + 1);
    expect(await verifySession(cookie, SECRET)).toBeNull();
  });

  it('una sesión muy antigua queda rechazada aunque la firma siga intacta', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const cookie = await signSession(EMAIL, SECRET);

    // Un año después: la firma es válida, pero la sesión ya venció.
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 365 * 24 * 60 * 60 * 1000);
    expect(await verifySession(cookie, SECRET)).toBeNull();
  });
});

describe('manipulación de la cookie', () => {
  it('un payload alterado invalida la firma', async () => {
    const cookie = await signSession(EMAIL, SECRET);
    const [payloadB64, sigB64] = cookie.split('.');

    // Cambia un carácter del payload conservando su longitud.
    const flipped = (payloadB64[0] === 'A' ? 'B' : 'A') + payloadB64.slice(1);
    expect(await verifySession(`${flipped}.${sigB64}`, SECRET)).toBeNull();
  });

  it('una firma alterada no valida', async () => {
    const cookie = await signSession(EMAIL, SECRET);
    const [payloadB64, sigB64] = cookie.split('.');

    const flipped = (sigB64[0] === 'A' ? 'B' : 'A') + sigB64.slice(1);
    expect(await verifySession(`${payloadB64}.${flipped}`, SECRET)).toBeNull();
  });

  it('una sesión emitida con otro secreto no valida con este', async () => {
    const cookie = await signSession(EMAIL, OTHER_SECRET);
    expect(await verifySession(cookie, SECRET)).toBeNull();
  });

  it('reinyectar el payload de una cookie dentro de otra firma tampoco valida', async () => {
    const cookie = await signSession(EMAIL, SECRET);
    const other = await signSession(EMAIL, OTHER_SECRET);
    const [payloadB64] = cookie.split('.');
    const [, otherSigB64] = other.split('.');

    expect(await verifySession(`${payloadB64}.${otherSigB64}`, SECRET)).toBeNull();
  });

  it('ascalar privilegios cambiando el email rompe la firma', async () => {
    const forged = craftCookie(SECRET, JSON.stringify({ e: 'admin', x: Date.now() + 60_000 }));
    const [, sigB64] = forged.split('.');

    const tampered = craftCookie(SECRET, JSON.stringify({ e: 'root', x: Date.now() + 60_000 }));
    const [tamperedPayloadB64] = tampered.split('.');

    expect(await verifySession(`${tamperedPayloadB64}.${sigB64}`, SECRET)).toBeNull();
    expect(await verifySession(forged, SECRET)).toBe('admin');
  });

  it('una firma correcta sobre un payload con formato inválido no entra', async () => {
    for (const payloadText of [
      'no-es-json',
      '{}',
      JSON.stringify({ e: 123, x: Date.now() + 60_000 }),
      JSON.stringify({ e: 'admin', x: 'mañana' }),
      JSON.stringify({ x: Date.now() + 60_000 }),
      JSON.stringify({ e: 'admin' }),
    ]) {
      const cookie = craftCookie(SECRET, payloadText);
      expect(await verifySession(cookie, SECRET), `payload: ${payloadText}`).toBeNull();
    }
  });
});

describe('entradas ausentes o corruptas', () => {
  it('sin cookie no hay sesión', async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession(null, SECRET)).toBeNull();
    expect(await verifySession('', SECRET)).toBeNull();
  });

  it('sin secreto no hay sesión (fail-closed)', async () => {
    const cookie = await signSession(EMAIL, SECRET);
    expect(await verifySession(cookie, undefined)).toBeNull();
    expect(await verifySession(cookie, null)).toBeNull();
    expect(await verifySession(cookie, '')).toBeNull();
  });

  it.each([
    ['sin separador', 'solo-payload'],
    ['con un punto vacío a la izquierda', '.firma'],
    ['con un punto vacío a la derecha', 'payload.'],
    ['con partes vacías', '.'],
    ['con un payload basura', '###.###'],
    ['con base64 inválido', 'no$base64.tampoco$base64'],
    ['con demasiados segmentos', 'a.b.c.d'],
  ])('rechaza una cookie malformada (%s)', async (_label, cookie) => {
    expect(await verifySession(cookie, SECRET)).toBeNull();
  });

  it('no lanza con entradas hostiles: siempre devuelve string o null', async () => {
    const hostile = [
      'A'.repeat(100_000) + '.' + 'B'.repeat(100_000),
      '..',
      'payload.',
      craftCookie(SECRET, JSON.stringify({ e: 'admin', x: 'NaN' })),
    ];
    for (const cookie of hostile) {
      await expect(verifySession(cookie, SECRET)).resolves.toBeNull();
    }
  });
});

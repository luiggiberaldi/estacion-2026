import { describe, expect, it } from 'vitest';
import { securityHeaders } from '@/lib/security-headers';

const asMap = (prod: boolean) => new Map(securityHeaders(prod).map((h) => [h.key, h.value]));

describe('securityHeaders', () => {
  it('impide meter el panel en un iframe ajeno', () => {
    const h = asMap(true);
    expect(h.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(h.get('X-Frame-Options')).toBe('DENY');
  });

  it('incluye nosniff, Referrer-Policy y Permissions-Policy', () => {
    const h = asMap(false);
    expect(h.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    // La cámara se mantiene para el escáner QR; micrófono y ubicación, no.
    expect(h.get('Permissions-Policy')).toBe('camera=(self), microphone=(), geolocation=()');
  });

  it('HSTS solo en producción', () => {
    expect(asMap(true).get('Strict-Transport-Security')).toMatch(/max-age=31536000/);
    expect(asMap(false).has('Strict-Transport-Security')).toBe(false);
  });

  it('no toca CORS (lo maneja backup-auth.ts)', () => {
    for (const prod of [true, false]) {
      for (const { key } of securityHeaders(prod)) {
        expect(key.toLowerCase().startsWith('access-control-')).toBe(false);
      }
    }
  });
});

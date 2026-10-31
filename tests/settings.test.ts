// tests/settings.test.ts
//
// Ajustes de la Estación (src/lib/settings-schema.ts) y versión del PIN en la
// sesión (src/lib/session.ts): validación, valores por defecto, tolerancia a
// datos raros en la base y rechazo de PINs triviales.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEMPLATES,
  SettingsValidationError,
  defaultSettings,
  mergeWithDefaults,
  termsFor,
  validateSettings,
  weakPinReason,
} from '@/lib/settings-schema';
import { PRODUCT_PRICES, MONTHLY_GRACE_DAYS } from '@/lib/licensePolicy';
import { signSession, verifySession, verifySessionClaims } from '@/lib/session';

const SECRET = 'secreto-de-sesion-muy-largo-y-aleatorio-1234567890';

describe('valores por defecto', () => {
  it('salen de licensePolicy.js: sin migración todo sigue igual que antes', () => {
    const d = defaultSettings();
    expect(d.products.bodega).toMatchObject(PRODUCT_PRICES.bodega);
    expect(d.products.farmacia).toMatchObject(PRODUCT_PRICES.farmacia);
    expect(d.products.bodega.monthlyGraceDays).toBe(MONTHLY_GRACE_DAYS);
    expect(d.products.bodega.demoDays).toBe(3);
    expect(d.templates.map((t) => t.id)).toEqual(DEFAULT_TEMPLATES.map((t) => t.id));
  });

  it('los ajustes por defecto pasan su propia validación', () => {
    expect(validateSettings(defaultSettings())).toEqual(defaultSettings());
  });

  it('termsFor usa licensePolicy para productos sin ajustes (Pro)', () => {
    expect(termsFor(defaultSettings(), 'pro')).toMatchObject({ permanent: 0, monthly: 0 });
  });
});

describe('validateSettings', () => {
  const valid = () => defaultSettings();

  it('acepta precios con decimales y los redondea a centavos', () => {
    const s = valid();
    s.products.farmacia.permanent = 299.999;
    expect(validateSettings(s).products.farmacia.permanent).toBe(300);
  });

  it('acepta números escritos como texto (lo que manda un input)', () => {
    const s = valid() as unknown as { products: { bodega: Record<string, unknown> } };
    s.products.bodega.permanent = '120';
    expect(validateSettings(s).products.bodega.permanent).toBe(120);
  });

  it.each([
    ['precio negativo', (s: ReturnType<typeof valid>) => { s.products.bodega.permanent = -1; }, /precio permanente/],
    ['precio vacío', (s: ReturnType<typeof valid>) => { (s.products.bodega as unknown as Record<string, unknown>).monthly = ''; }, /precio mensual: debe ser un número/],
    ['demo de 0 días', (s: ReturnType<typeof valid>) => { s.products.farmacia.demoDays = 0; }, /días de demo/],
    ['gracia con decimales', (s: ReturnType<typeof valid>) => { s.products.bodega.monthlyGraceDays = 2.5; }, /entero/],
    ['gracia de 31 días', (s: ReturnType<typeof valid>) => { s.products.bodega.monthlyGraceDays = 31; }, /entre 0 y 30/],
    ['WhatsApp corto', (s: ReturnType<typeof valid>) => { s.contact.whatsapp = '0414'; }, /WhatsApp/],
    ['correo inválido', (s: ReturnType<typeof valid>) => { s.contact.email = 'no-es-correo'; }, /Correo/],
    ['sin plantillas', (s: ReturnType<typeof valid>) => { s.templates = []; }, /al menos una plantilla/],
    ['plantilla vacía', (s: ReturnType<typeof valid>) => { s.templates[0].body = '   '; }, /texto está vacío/],
  ])('rechaza %s', (_name, mutate, message) => {
    const s = valid();
    mutate(s);
    expect(() => validateSettings(s)).toThrow(SettingsValidationError);
    expect(() => validateSettings(s)).toThrow(message);
  });

  it('rechaza plantillas con id repetido', () => {
    const s = valid();
    s.templates.push({ ...s.templates[0] });
    expect(() => validateSettings(s)).toThrow(/repetida/);
  });

  it('deja solo dígitos en el WhatsApp', () => {
    const s = valid();
    s.contact.whatsapp = '+58 414-123.45.67';
    expect(validateSettings(s).contact.whatsapp).toBe('584141234567');
  });

  it('rechaza basura', () => {
    expect(() => validateSettings(null)).toThrow(SettingsValidationError);
    expect(() => validateSettings({})).toThrow(/Lite/);
  });
});

describe('mergeWithDefaults (lo guardado en la base)', () => {
  it('nunca lanza y rellena lo que falte', () => {
    expect(mergeWithDefaults(null)).toEqual(defaultSettings());
    expect(mergeWithDefaults('basura')).toEqual(defaultSettings());
    const m = mergeWithDefaults({ products: { farmacia: { permanent: 350 } } });
    expect(m.products.farmacia.permanent).toBe(350);
    expect(m.products.farmacia.monthly).toBe(PRODUCT_PRICES.farmacia.monthly);
    expect(m.products.bodega).toEqual(defaultSettings().products.bodega);
  });

  it('ignora valores no numéricos o negativos', () => {
    const m = mergeWithDefaults({ products: { bodega: { permanent: 'mucho', monthly: -5 } } });
    expect(m.products.bodega.permanent).toBe(PRODUCT_PRICES.bodega.permanent);
    expect(m.products.bodega.monthly).toBe(PRODUCT_PRICES.bodega.monthly);
  });

  it('el objeto vacío de la migración 006 da las plantillas de fábrica', () => {
    expect(mergeWithDefaults({ templates: {} }).templates).toHaveLength(DEFAULT_TEMPLATES.length);
  });

  it('respeta plantillas guardadas y descarta las mal formadas', () => {
    const m = mergeWithDefaults({
      templates: [{ id: 'x', title: 'X', body: 'hola' }, { id: 1 }, null],
    });
    expect(m.templates).toEqual([{ id: 'x', title: 'X', body: 'hola', description: '' }]);
  });
});

describe('weakPinReason', () => {
  it.each(['000000', '111111', '123456', '654321', '234567', '901234'])('rechaza %s', (pin) => {
    expect(weakPinReason(pin)).not.toBeNull();
  });

  it.each(['12345', '1234567', 'abcdef', ''])('rechaza formato inválido %s', (pin) => {
    expect(weakPinReason(pin)).toMatch(/6 dígitos/);
  });

  it.each(['482915', '130795', '772041'])('acepta %s', (pin) => {
    expect(weakPinReason(pin)).toBeNull();
  });
});

describe('versión del PIN en la sesión', () => {
  it('la sesión lleva la versión con que se emitió', async () => {
    const cookie = await signSession('admin', SECRET, 3);
    expect(await verifySessionClaims(cookie, SECRET)).toEqual({ email: 'admin', pinVersion: 3 });
    expect(await verifySession(cookie, SECRET)).toBe('admin');
  });

  it('las sesiones anteriores a 2.0 (sin versión) cuentan como versión 0', async () => {
    const cookie = await signSession('admin', SECRET);
    expect((await verifySessionClaims(cookie, SECRET))?.pinVersion).toBe(0);
  });
});

// tests/notifications.test.ts
//
// Cobertura del reconciliador de notificaciones (src/lib/notifications.ts),
// el productor de la tormenta de upserts del 23-oct (58.531 POSTs en un día
// para una tabla de 125 filas: el sweep re-upserteaba ~94 alertas activas,
// una fila por request, en cada refresco de la campana). Tres propiedades
// selladas aquí:
//   1. SOLO EN TRANSICIÓN: cada condición emite la primera vez que se cumple;
//      si su (type, ref_id) ya existe, ni siquiera se envía la escritura.
//      Una transición posterior (vencida tras "por vencer") sí emite, porque
//      su clave es distinta.
//   2. BATCH ÚNICO: todas las filas nuevas van en UN solo upsert
//      (on_conflict=type,ref_id + ignore-duplicates), no una request por fila.
//   3. CICLO DE 5 MINUTOS: el barrido corre como máximo cada 5 min aunque se
//      consulte cada minuto; las llamadas concurrentes comparten el barrido.
//
// También se sella que notify() (evento puntual "demo creada" de actions.ts)
// conserva su upsert idempotente unitario, y que las ventanas de dominio
// (72 h / 30 días / 7 días) quedan intactas.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  existingRows: [] as Array<{ type: string; ref_id: string }>,
  devices: [] as Array<Record<string, any>>,
  upserts: [] as Array<{ rows: any[]; options: any }>,
  selectTables: [] as string[],
  getLicenses: async (_productId?: unknown): Promise<any[]> => [],
  licensesByProduct: undefined as undefined | Record<string, () => Promise<any[]>>,
  getFailedBackupRequests: async (): Promise<any[]> => [],
}));

vi.mock('@/lib/supabase', () => {
  const builderFor = (table: string) => {
    // Filtros gte reales: la ventana de 7 días de dispositivos nuevos vive en
    // la query (.gte sobre created_at), así que el mock debe aplicarla.
    const gteFilters: Array<[string, any]> = [];
    const builder: any = {
      select: () => {
        h.selectTables.push(table);
        return builder;
      },
      upsert: (rows: any[], options: any) => {
        h.upserts.push({ rows, options });
        return Promise.resolve({ data: rows, error: null });
      },
      in: () => builder,
      gte: (col: string, val: any) => {
        gteFilters.push([col, val]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      then: (resolve: (v: any) => any, reject: (e: any) => any) => {
        const base = table === 'account_devices' ? h.devices : h.existingRows;
        const data = base.filter((d: any) => gteFilters.every(([c, v]) => d[c] >= v));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { getSupabaseAdmin: () => ({ from: (table: string) => builderFor(table) }) };
});

// Como el getLicenses real, el simulado filtra por producto: las fixtures
// (h.getLicenses) son licencias de Lite ('bodega'), salvo que un test defina
// h.licensesByProduct para otro producto (p. ej. Farmacia).
vi.mock('@/lib/actions', () => ({
  getLicenses: (productId: unknown) =>
    h.licensesByProduct?.[String(productId)]?.() ??
    (productId === 'bodega' ? h.getLicenses(productId) : Promise.resolve([])),
  getFailedBackupRequests: () => h.getFailedBackupRequests(),
}));

const T0 = new Date('2026-10-24T12:00:00.000Z').getTime();
const HOUR = 60 * 60 * 1000;

// Licencia demo con la forma que consume el sweep (id, type, status, alias,
// deviceId, expiresAt); el resto de campos del dominio no participan.
function demoLicense(id: string, over: Record<string, any> = {}) {
  return {
    id,
    deviceId: `PDA-${id}`,
    alias: null,
    type: 'demo7',
    status: 'active',
    expiresAt: new Date(T0 + 48 * HOUR).toISOString(),
    ...over,
  };
}

async function loadNotifications() {
  return await import('@/lib/notifications');
}

beforeEach(() => {
  // Reloj congelado en T0: las ventanas (72 h / 30 días / 7 días) se calculan con
  // Date.now(), así que sin esto el test caduca con el paso de los días.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  vi.resetModules();
  h.existingRows = [];
  h.devices = [];
  h.upserts = [];
  h.selectTables = [];
  h.getLicenses = async () => [];
  h.licensesByProduct = undefined;
  h.getFailedBackupRequests = async () => [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('reconciliación de eventos (ensureEventNotifications)', () => {
  it('Farmacia emite sus propias alertas, etiquetadas con su producto', async () => {
    h.licensesByProduct = { farmacia: async () => [demoLicense('F1')] };

    const { ensureEventNotifications } = await loadNotifications();
    await ensureEventNotifications();

    const rows = h.upserts.flatMap((u: any) => u.rows);
    const farmacia = rows.filter((r: any) => r.ref_id === 'demo_expiring:F1');
    expect(farmacia).toHaveLength(1);
    expect(farmacia[0].product_id).toBe('farmacia');
  });

  it('emite las transiciones nuevas en UN solo upsert y omite las claves ya existentes', async () => {
    h.getLicenses = async () => [demoLicense('L1'), demoLicense('L2')];
    h.getFailedBackupRequests = async () => [
      { deviceId: 'PDA-B1', alias: null, error: 'disco lleno', createdAt: '2026-10-24T10:00:00.000Z' },
    ];
    h.devices = [{ device_id: 'PDA-N1', device_alias: 'Caja 1', created_at: '2026-10-23T10:00:00.000Z' }];
    // L1 ya fue emitida en un ciclo anterior → es peso muerto, no transición.
    h.existingRows = [{ type: 'demo_expiring', ref_id: 'demo_expiring:L1' }];

    const { ensureEventNotifications } = await loadNotifications();
    await ensureEventNotifications();

    // BATCH ÚNICO: una sola escritura para todas las filas nuevas…
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0].options).toEqual({ onConflict: 'type,ref_id', ignoreDuplicates: true });

    const refs = h.upserts[0].rows.map((r: any) => r.ref_id).sort();
    expect(refs).toEqual([
      'backup_failed:PDA-B1:2026-10-24T10:00:00.000Z',
      'demo_expiring:L2',
      'device_new:PDA-N1',
    ]);
    // …y SOLO EN TRANSICIÓN: la clave existente ni se envía.
    expect(h.upserts[0].rows.some((r: any) => r.ref_id === 'demo_expiring:L1')).toBe(false);
  });

  it('sin transiciones nuevas no escribe nada (cero upserts)', async () => {
    h.getLicenses = async () => [demoLicense('L1')];
    h.existingRows = [{ type: 'demo_expiring', ref_id: 'demo_expiring:L1' }];

    const { ensureEventNotifications } = await loadNotifications();
    await ensureEventNotifications();

    expect(h.upserts).toHaveLength(0);
    // La lectura de claves sí ocurre (1 SELECT barato) para saber qué existe.
    expect(h.selectTables).toContain('notifications');
  });

  it('una transición posterior emite con su propia clave (vencida tras por vencer)', async () => {
    h.getLicenses = async () => [
      demoLicense('L1', { status: 'expired', expiresAt: new Date(T0 - 2 * HOUR).toISOString() }),
    ];
    h.existingRows = [{ type: 'demo_expiring', ref_id: 'demo_expiring:L1' }];

    const { ensureEventNotifications } = await loadNotifications();
    await ensureEventNotifications();

    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0].rows.map((r: any) => r.ref_id)).toEqual(['demo_expired:L1']);
  });

  it('reconcilia como máximo cada 5 minutos aunque se consulte más seguido', async () => {
    let calls = 0;
    h.getLicenses = async () => {
      calls += 1;
      return [];
    };
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(T0);

    const { ensureEventNotifications } = await loadNotifications();

    await ensureEventNotifications();
    expect(calls).toBe(1);

    // 4 min después: el ciclo no venció → ni lectura ni escritura.
    nowSpy.mockReturnValue(T0 + 4 * 60 * 1000);
    await ensureEventNotifications();
    expect(calls).toBe(1);

    // 5 min después: toca reconciliar de nuevo.
    nowSpy.mockReturnValue(T0 + 5 * 60 * 1000);
    await ensureEventNotifications();
    expect(calls).toBe(2);
  });

  it('llamadas concurrentes comparten un mismo barrido', async () => {
    let calls = 0;
    h.getLicenses = async () => {
      calls += 1;
      // Barrido lento: ambas llamadas llegan antes de que termine.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return [];
    };

    const { ensureEventNotifications } = await loadNotifications();
    const p1 = ensureEventNotifications();
    const p2 = ensureEventNotifications();
    await Promise.all([p1, p2]);

    expect(calls).toBe(1);
  });

  it('las ventanas de dominio quedan intactas (72 h / 30 días / 7 días)', async () => {
    h.getLicenses = async () => [
      // Vence en 8 días: fuera de la ventana de 72 h → no notifica.
      demoLicense('FUTURO', { expiresAt: new Date(T0 + 8 * 24 * HOUR).toISOString() }),
      // Vencida hace 40 días: fuera de la ventana de 30 días → no notifica.
      demoLicense('VIEJA', {
        status: 'expired',
        expiresAt: new Date(T0 - 40 * 24 * HOUR).toISOString(),
      }),
    ];
    // Registrado hace 8 días: fuera de la ventana de 7 días → no notifica.
    h.devices = [
      { device_id: 'PDA-VIEJO', device_alias: null, created_at: new Date(T0 - 8 * 24 * HOUR).toISOString() },
    ];

    const { ensureEventNotifications } = await loadNotifications();
    await ensureEventNotifications();

    expect(h.upserts).toHaveLength(0);
  });
});

describe('notify() puntual (evento de transición de actions.ts)', () => {
  it('conserva su upsert idempotente unitario con la clave dada', async () => {
    const { notify } = await loadNotifications();
    await notify(
      'demo_created',
      'Nueva demo · Donde Juancho',
      'Demo demo3 activada.',
      'demo_created:bodega:PDA-9',
      'bodega'
    );

    expect(h.upserts).toHaveLength(1);
    // Upsert unitario (un objeto, no un arreglo): es el evento puntual.
    expect(h.upserts[0].rows).toEqual({
      type: 'demo_created',
      title: 'Nueva demo · Donde Juancho',
      body: 'Demo demo3 activada.',
      ref_id: 'demo_created:bodega:PDA-9',
      product_id: 'bodega',
    });
    expect(h.upserts[0].options).toEqual({ onConflict: 'type,ref_id', ignoreDuplicates: true });
  });
});

// tests/backup-storage.test.ts
//
// Cobertura de src/lib/backup-storage.ts (lógica pura, sin I/O):
// configuración server-only fail-closed, construcción de rutas anti-traversal
// y selección de objetos a borrar bajo retención.
//
// Casos: éxito, fallo y límites.

import { describe, expect, it } from 'vitest';

import {
  BACKUP_RETENTION_COUNT,
  buildBackupObjectPath,
  readBackupStorageConfig,
  selectBackupsToDelete,
  type RetainableBackup,
} from '@/lib/backup-storage';

const PROJECT_URL = 'https://qlujyvauumzfpdefdkyl.supabase.co';
const SERVICE_KEY = 'service-role-key-de-prueba-32-bytes-minimo';
const BUCKET = 'backups-private';

const baseEnv = (): Record<string, string | undefined> => ({
  SUPABASE_BACKUP_URL: PROJECT_URL,
  SUPABASE_BACKUP_SERVICE_ROLE_KEY: SERVICE_KEY,
  SUPABASE_BACKUP_BUCKET: BUCKET,
});

// UUIDs válidos (reutilizables en las pruebas de ruta). El primero incluye
// letras hex para poder probar la normalización a minúsculas.
const BUSINESS_ID = '1a2b3c4d-2222-3333-4444-555555555abc';
const OPERATION_ID = 'aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('readBackupStorageConfig · configuración server-only', () => {
  it('acepta la configuración completa y la devuelve tal cual', () => {
    const result = readBackupStorageConfig(baseEnv());
    expect(result).toEqual({
      ok: true,
      config: { url: PROJECT_URL, serviceRoleKey: SERVICE_KEY, bucket: BUCKET },
    });
  });

  it('fail-closed: faltan las tres variables → missing', () => {
    expect(readBackupStorageConfig({})).toEqual({ ok: false, reason: 'missing' });
  });

  it.each([
    ['SUPABASE_BACKUP_URL'],
    ['SUPABASE_BACKUP_SERVICE_ROLE_KEY'],
    ['SUPABASE_BACKUP_BUCKET'],
  ])('fail-closed: falta %s → missing', (variable) => {
    const env = baseEnv();
    delete env[variable];
    expect(readBackupStorageConfig(env)).toEqual({ ok: false, reason: 'missing' });
  });

  it('fail-closed: variable vacía cuenta como missing', () => {
    const env = baseEnv();
    env.SUPABASE_BACKUP_BUCKET = '';
    expect(readBackupStorageConfig(env)).toEqual({ ok: false, reason: 'missing' });
  });

  it('rechaza una URL que no se puede parsear', () => {
    expect(readBackupStorageConfig({ ...baseEnv(), SUPABASE_BACKUP_URL: 'no-es-una-url' }))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it('rechaza http:// aunque el host sea el correcto', () => {
    expect(readBackupStorageConfig({ ...baseEnv(), SUPABASE_BACKUP_URL: 'http://qlujyvauumzfpdefdkyl.supabase.co' }))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['otro proyecto', 'https://otroproyecto.supabase.co'],
    ['sufijo malicioso del dominio', 'https://qlujyvauumzfpdefdkyl.supabase.co.evil.com'],
    ['host parecido', 'https://qlujyvauumzfpdefdkyl.supabase.co.uk'],
    ['localhost', 'https://localhost:54321'],
  ])('rechaza un host que no es el proyecto esperado (%s)', (_label, url) => {
    expect(readBackupStorageConfig({ ...baseEnv(), SUPABASE_BACKUP_URL: url }))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it.each([
    ['mayúsculas', 'Backups'],
    ['carácter inválido (punto)', 'backups.private'],
    ['barra', 'backups/private'],
    ['espacio', 'backups priv'],
    ['demasiado corto (2)', 'ab'],
    ['demasiado largo (64)', 'a'.repeat(64)],
  ])('rechaza nombre de bucket inválido (%s)', (_label, bucket) => {
    expect(readBackupStorageConfig({ ...baseEnv(), SUPABASE_BACKUP_BUCKET: bucket }))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it('acepta los límites del regex de bucket (3 y 63 caracteres)', () => {
    // El regex exige 1 carácter inicial + 2 a 62 restantes → total 3 a 63.
    for (const bucket of ['abc', 'a'.repeat(63), 'a_-9', '9-inicia-con-numero']) {
      const result = readBackupStorageConfig({ ...baseEnv(), SUPABASE_BACKUP_BUCKET: bucket });
      expect(result.ok, `bucket "${bucket}" debería ser válido`).toBe(true);
    }
  });
});

describe('buildBackupObjectPath · ruta de objeto', () => {
  it('construye la ruta con año, mes y sello UTC compacto', () => {
    const path = buildBackupObjectPath({
      businessId: BUSINESS_ID,
      operationId: OPERATION_ID,
      serverTime: new Date('2026-10-13T12:34:56.789Z'),
    });
    expect(path).toBe(
      `${BUSINESS_ID}/2026/10/20261013T123456Z-${OPERATION_ID}.json.gz`
    );
  });

  it('normaliza a minúsculas ambos identificadores', () => {
    const path = buildBackupObjectPath({
      businessId: BUSINESS_ID.toUpperCase(),
      operationId: OPERATION_ID.toUpperCase(),
      serverTime: new Date('2026-10-13T12:34:56.789Z'),
    });
    expect(path).toContain(BUSINESS_ID.toLowerCase());
    expect(path).toContain(OPERATION_ID.toLowerCase());
    expect(path).not.toContain(BUSINESS_ID.toUpperCase());
  });

  it('rellena el mes con cero (marzo → 03)', () => {
    const path = buildBackupObjectPath({
      businessId: BUSINESS_ID,
      operationId: OPERATION_ID,
      serverTime: new Date('2026-03-05T07:08:09.000Z'),
    });
    expect(path).toBe(
      `${BUSINESS_ID}/2026/03/20260305T070809Z-${OPERATION_ID}.json.gz`
    );
  });

  it('descarta los milisegundos: el sello dura segundos', () => {
    const path = buildBackupObjectPath({
      businessId: BUSINESS_ID,
      operationId: OPERATION_ID,
      serverTime: new Date('2026-12-31T23:59:59.999Z'),
    });
    expect(path).toContain('20261231T235959Z');
    expect(path).not.toContain('999');
  });

  it('rechaza businessId que no es UUID', () => {
    expect(() => buildBackupObjectPath({
      businessId: 'no-es-uuid',
      operationId: OPERATION_ID,
      serverTime: new Date(),
    })).toThrow(/Identificador inválido/);
  });

  it('rechaza operationId que no es UUID', () => {
    expect(() => buildBackupObjectPath({
      businessId: BUSINESS_ID,
      operationId: 'tampoco-es-uuid',
      serverTime: new Date(),
    })).toThrow(/Identificador inválido/);
  });

  it('rechaza traversal de directorios disfrazado de businessId', () => {
    for (const businessId of ['../../../../etc/passwd', '..%2F..%2Fetc', '11111111-2222-3333-4444-555555555555/../..']) {
      expect(() => buildBackupObjectPath({
        businessId,
        operationId: OPERATION_ID,
        serverTime: new Date(),
      }), `debería rechazar "${businessId}"`).toThrow(/Identificador inválido/);
    }
  });

  it('la ruta tiene exactamente sus 4 segmentos y termina en .json.gz', () => {
    const path = buildBackupObjectPath({
      businessId: BUSINESS_ID,
      operationId: OPERATION_ID,
      serverTime: new Date('2026-10-13T12:34:56.789Z'),
    });
    // negocio / año / mes / archivo
    expect(path.split('/')).toHaveLength(4);
    expect(path.startsWith('../')).toBe(false);
    expect(path.endsWith('.json.gz')).toBe(true);
  });
});

describe('selectBackupsToDelete · retención de 3 copias', () => {
  const backup = (path: string, createdAt: string): RetainableBackup => ({ path, createdAt });

  it('conserva BACKUP_RETENTION_COUNT como valor por defecto', () => {
    expect(BACKUP_RETENTION_COUNT).toBe(3);
  });

  it('sin copias no hay nada que borrar', () => {
    expect(selectBackupsToDelete([])).toEqual([]);
  });

  it('por debajo del límite no borra ninguna', () => {
    const list = [
      backup('a', '2026-10-13T10:00:00Z'),
      backup('b', '2026-10-13T11:00:00Z'),
    ];
    expect(selectBackupsToDelete(list)).toEqual([]);
  });

  it('exactamente en el límite no borra ninguna', () => {
    const list = [
      backup('a', '2026-10-13T10:00:00Z'),
      backup('b', '2026-10-13T11:00:00Z'),
      backup('c', '2026-10-13T12:00:00Z'),
    ];
    expect(selectBackupsToDelete(list)).toEqual([]);
  });

  it('sobre el límite marca solo las más antiguas (devueltas de más nueva a más vieja)', () => {
    const list = [
      backup('a', '2026-10-13T10:00:00Z'),
      backup('b', '2026-10-13T11:00:00Z'),
      backup('c', '2026-10-13T12:00:00Z'),
      backup('d', '2026-10-13T13:00:00Z'),
      backup('e', '2026-10-13T14:00:00Z'),
    ];
    expect(selectBackupsToDelete(list).map((b) => b.path)).toEqual(['b', 'a']);
  });

  it('ordena bien aunque la entrada venga desordenada', () => {
    const list = [
      backup('nuevo', '2026-10-13T20:00:00Z'),
      backup('viejo', '2026-10-13T08:00:00Z'),
      backup('medio', '2026-10-13T12:00:00Z'),
    ];
    expect(selectBackupsToDelete(list, 2).map((b) => b.path)).toEqual(['viejo']);
  });

  it('desempata por ruta descendente cuando la fecha es idéntica', () => {
    const same = '2026-10-13T12:00:00Z';
    const list = [backup('aaa', same), backup('bbb', same), backup('ccc', same), backup('ddd', same)];
    // Orden resultante: ddd, ccc, bbb, aaa → con keep=3 se conservan ddd/ccc/bbb.
    expect(selectBackupsToDelete(list).map((b) => b.path)).toEqual(['aaa']);
  });

  it('una fecha ilegible cae al desempate por ruta, sin romper', () => {
    const list = [
      backup('aaa', 'no-es-fecha'),
      backup('bbb', '2026-10-13T12:00:00Z'),
      backup('ccc', 'no-es-fecha'),
      backup('ddd', '2026-10-13T12:00:00Z'),
    ];
    const result = selectBackupsToDelete(list);
    // El comparador no puede ordenar fechas NaN y resuelve por ruta descendente:
    // ddd, bbb, ccc, aaa → con keep=3 se conservan los tres primeros.
    expect(result.map((b) => b.path)).toEqual(['aaa']);
  });

  it('respeta un límite personalizado', () => {
    const list = [
      backup('a', '2026-10-13T10:00:00Z'),
      backup('b', '2026-10-13T11:00:00Z'),
      backup('c', '2026-10-13T12:00:00Z'),
      backup('d', '2026-10-13T13:00:00Z'),
    ];
    expect(selectBackupsToDelete(list, 1).map((b) => b.path)).toEqual(['c', 'b', 'a']);
    expect(selectBackupsToDelete(list, 0).map((b) => b.path)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('no modifica el arreglo de entrada', () => {
    const list = [
      backup('a', '2026-10-13T10:00:00Z'),
      backup('b', '2026-10-13T11:00:00Z'),
      backup('c', '2026-10-13T12:00:00Z'),
      backup('d', '2026-10-13T13:00:00Z'),
    ];
    const snapshot = [...list];
    selectBackupsToDelete(list);
    expect(list).toEqual(snapshot);
  });
});

// tests/backup-upload.test.ts
//
// Cobertura de src/lib/backup-upload.ts (orquestación pura con dependencias
// inyectadas): subida verificada de respaldos con relectura + SHA-256,
// idempotencia ante reintento, marcado de fallo y limpieza de versiones viejas.
//
// Casos: éxito, cada fallo del pipeline y sus límites.

import { describe, expect, it } from 'vitest';

import { BACKUP_RETENTION_COUNT } from '@/lib/backup-storage';
import {
  MAX_UPLOAD_BYTES,
  runBackupUpload,
  sha256Hex,
  type UploadDeps,
  type UploadInput,
} from '@/lib/backup-upload';

const MANIFEST = 'manifest-1';
const BUSINESS = 'business-1';
const STORAGE_PATH = 'business/2026/10/20261019T120000Z-op.json.gz';

// ── Arnés de dependencias: registra cada llamada en orden ────────────────────
interface Call {
  name: string;
  args: unknown[];
}

interface Harness {
  deps: UploadDeps;
  calls: Call[];
  callsOf: (name: string) => Call[];
  orderOf: () => string[];
}

function makeDeps(overrides: Partial<UploadDeps> = {}): Harness {
  const calls: Call[] = [];
  const record =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
      (...args: A): R => {
        calls.push({ name, args });
        return fn(...args);
      };

  const deps: UploadDeps = {
    beginOperation: record('beginOperation', async () => ({
      ok: true as const,
      manifestId: MANIFEST,
      businessId: BUSINESS,
      storagePath: STORAGE_PATH,
      status: 'uploading',
    })),
    putObject: record('putObject', async () => ({ ok: true })),
    getObject: record('getObject', async () => null),
    removeObject: record('removeObject', async () => ({ ok: true })),
    finalize: record('finalize', async () => ({ ok: true as const, pendingCleanup: [] })),
    completeCleanup: record('completeCleanup', async () => ({ ok: true })),
    failOperation: record('failOperation', async () => undefined),
    ...Object.fromEntries(
      Object.entries(overrides).map(([key, fn]) => [key, record(key, fn as (...a: unknown[]) => unknown)]),
    ),
  } as UploadDeps;

  return {
    deps,
    calls,
    callsOf: (name) => calls.filter((c) => c.name === name),
    orderOf: () => calls.map((c) => c.name),
  };
}

const bytesOf = (payload: string): Uint8Array => new TextEncoder().encode(payload);

function inputOf(bytes: Uint8Array, sha256 = sha256Hex(bytes)): UploadInput {
  return {
    assignmentId: 'assignment-1',
    operationId: '11111111-2222-3333-4444-555555555555',
    storagePathFor: () => STORAGE_PATH,
    bytes,
    sha256,
    schemaVersion: 2,
  };
}

// Devuelve un getObject que sirve exactamente estos bytes.
const serves = (bytes: Uint8Array | null) => async () => bytes;

describe('sha256Hex', () => {
  it('coincide con el vector conocido de la cadena vacía', () => {
    expect(sha256Hex(new Uint8Array(0)))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('cambia ante una sola modificación del contenido', () => {
    expect(sha256Hex(bytesOf('abc'))).not.toBe(sha256Hex(bytesOf('abd')));
  });
});

describe('runBackupUpload · validación previa', () => {
  it('rechaza un respaldo vacío con 413 sin tocar ningún servicio', async () => {
    const h = makeDeps();
    const result = await runBackupUpload(inputOf(new Uint8Array(0)), h.deps);
    expect(result).toEqual({ ok: false, status: 413, error: 'Tamaño de respaldo inválido' });
    expect(h.calls).toEqual([]);
  });

  it('acepta el tamaño mínimo (1 byte): el límite inferior es estricto', async () => {
    const bytes = new Uint8Array(1);
    const h = makeDeps({ getObject: serves(bytes) });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toMatchObject({ ok: true, sizeBytes: 1 });
    expect(h.callsOf('putObject')).toHaveLength(1);
  });

  it('acepta exactamente el tamaño máximo: el límite superior es inclusivo', async () => {
    // Sin materializar 50 MB: se fija byteLength sobre un Uint8Array real, que
    // sigue siendo hasheable. El guard consulta byteLength, así que esto prueba
    // el borde `size > MAX_UPLOAD_BYTES` sin el costo de la asignación.
    const exact = new Uint8Array(1);
    Object.defineProperty(exact, 'byteLength', { value: MAX_UPLOAD_BYTES });
    const h = makeDeps({ getObject: serves(exact) });

    const result = await runBackupUpload(inputOf(exact), h.deps);

    expect(result).toMatchObject({ ok: true, sizeBytes: MAX_UPLOAD_BYTES });
    expect(result).not.toHaveProperty('status', 413);
  });

  it('rechaza un respaldo por encima del máximo con 413 sin tocar ningún servicio', async () => {
    const h = makeDeps();
    // Stub liviano: el guard solo consulta byteLength, sin materializar 50 MB.
    // Se pasa un sha256 fijo para que el helper no intente hashear el stub.
    const oversize = { byteLength: MAX_UPLOAD_BYTES + 1 } as unknown as Uint8Array;
    const result = await runBackupUpload(inputOf(oversize, 'f'.repeat(64)), h.deps);
    expect(result).toEqual({ ok: false, status: 413, error: 'Tamaño de respaldo inválido' });
    expect(h.calls).toEqual([]);
  });

  it('rechaza un SHA-256 que no coincide con el contenido con 400', async () => {
    const h = makeDeps();
    const bytes = bytesOf('contenido real');
    const result = await runBackupUpload(inputOf(bytes, sha256Hex(bytesOf('otro contenido'))), h.deps);
    expect(result).toEqual({ ok: false, status: 400, error: 'SHA-256 no coincide con el contenido' });
    expect(h.calls).toEqual([]);
  });
});

describe('runBackupUpload · inicio de la operación', () => {
  it('propaga el conflicto de operation_id como 409', async () => {
    const h = makeDeps({ beginOperation: async () => ({ ok: false, code: 'operation_id_payload_conflict' }) });
    const result = await runBackupUpload(inputOf(bytesOf('x')), h.deps);
    expect(result).toEqual({ ok: false, status: 409, error: 'No se pudo iniciar la operación de respaldo' });
    expect(h.callsOf('failOperation')).toHaveLength(0);
    expect(h.callsOf('putObject')).toHaveLength(0);
  });

  it('cualquier otro fallo de inicio es 422', async () => {
    const h = makeDeps({ beginOperation: async () => ({ ok: false, code: 'db_down' }) });
    const result = await runBackupUpload(inputOf(bytesOf('x')), h.deps);
    expect(result).toEqual({ ok: false, status: 422, error: 'No se pudo iniciar la operación de respaldo' });
    expect(h.callsOf('failOperation')).toHaveLength(0);
  });

  it('pasa a beginOperation los metadatos exactos del respaldo', async () => {
    const h = makeDeps();
    const bytes = bytesOf('metadatos');
    await runBackupUpload(inputOf(bytes), h.deps);
    expect(h.callsOf('beginOperation')[0].args[0]).toEqual({
      assignmentId: 'assignment-1',
      operationId: '11111111-2222-3333-4444-555555555555',
      sizeBytes: bytes.byteLength,
      sha256: sha256Hex(bytes),
      schemaVersion: 2,
    });
  });

  it.each(['verified', 'cleanup_pending', 'deleted'] as const)(
    'reintento idempotente sobre una operación ya "%s" responde ok sin reescribir',
    async (status) => {
      const h = makeDeps({ beginOperation: async () => ({
        ok: true as const, manifestId: MANIFEST, businessId: BUSINESS, storagePath: STORAGE_PATH, status,
      }) });
      const bytes = bytesOf('ya confirmado');
      const result = await runBackupUpload(inputOf(bytes), h.deps);
      expect(result).toEqual({
        ok: true,
        operationId: '11111111-2222-3333-4444-555555555555',
        backupId: MANIFEST,
        sizeBytes: bytes.byteLength,
        sha256: sha256Hex(bytes),
        retained: BACKUP_RETENTION_COUNT,
        cleanupPending: 0,
      });
      expect(h.callsOf('putObject')).toHaveLength(0);
      expect(h.callsOf('finalize')).toHaveLength(0);
      expect(h.callsOf('failOperation')).toHaveLength(0);
    },
  );

  it('un estado inesperado corta con 409 y sin escrituras', async () => {
    const h = makeDeps({ beginOperation: async () => ({
      ok: true as const, manifestId: MANIFEST, businessId: BUSINESS, storagePath: STORAGE_PATH, status: 'failed',
    }) });
    const result = await runBackupUpload(inputOf(bytesOf('x')), h.deps);
    expect(result).toEqual({ ok: false, status: 409, error: 'La operación no se puede continuar' });
    expect(h.callsOf('putObject')).toHaveLength(0);
    expect(h.callsOf('failOperation')).toHaveLength(0);
  });
});

describe('runBackupUpload · subida y verificación', () => {
  it('flujo feliz: begin → put → relectura → finalize, sin failOperation', async () => {
    const bytes = bytesOf('respaldo completo');
    const h = makeDeps({ getObject: serves(bytes) });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toEqual({
      ok: true,
      operationId: '11111111-2222-3333-4444-555555555555',
      backupId: MANIFEST,
      sizeBytes: bytes.byteLength,
      sha256: sha256Hex(bytes),
      retained: BACKUP_RETENTION_COUNT,
      cleanupPending: 0,
    });
    expect(h.orderOf()).toEqual(['beginOperation', 'putObject', 'getObject', 'finalize']);
    expect(h.callsOf('failOperation')).toHaveLength(0);
  });

  it('si putObject falla marca object_upload_failed y responde 502', async () => {
    const bytes = bytesOf('x');
    const h = makeDeps({ putObject: async () => ({ ok: false }), getObject: serves(bytes) });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toEqual({ ok: false, status: 502, error: 'No se pudo subir el respaldo' });
    expect(h.callsOf('failOperation')[0].args).toEqual([MANIFEST, 'object_upload_failed']);
    expect(h.callsOf('finalize')).toHaveLength(0);
  });

  it('si la relectura no devuelve nada marca verification_failed, borra el objeto y responde 502', async () => {
    const bytes = bytesOf('x');
    const h = makeDeps({ getObject: serves(null) });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toEqual({ ok: false, status: 502, error: 'El objeto almacenado no coincide' });
    expect(h.callsOf('removeObject')[0].args).toEqual([STORAGE_PATH]);
    expect(h.callsOf('failOperation')[0].args).toEqual([MANIFEST, 'verification_failed']);
  });

  it('si lo almacenado tiene otro tamaño que lo subido, no se confirma', async () => {
    const bytes = bytesOf('abcdef');
    const truncated = bytesOf('abc');
    const h = makeDeps({ getObject: serves(truncated) });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toEqual({ ok: false, status: 502, error: 'El objeto almacenado no coincide' });
    expect(h.callsOf('failOperation')[0].args).toEqual([MANIFEST, 'verification_failed']);
    expect(h.callsOf('finalize')).toHaveLength(0);
  });

  it('si lo almacenado tiene el mismo tamaño pero otro contenido tampoco se confirma', async () => {
    const bytes = bytesOf('abcdef');
    const tampered = bytesOf('abcdeg'); // mismo largo, un byte distinto
    const h = makeDeps({ getObject: serves(tampered) });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toEqual({ ok: false, status: 502, error: 'El objeto almacenado no coincide' });
    expect(h.callsOf('failOperation')[0].args).toEqual([MANIFEST, 'verification_failed']);
    expect(h.callsOf('finalize')).toHaveLength(0);
  });

  it('si finalize falla responde 409 y conserva el marcado de fallo', async () => {
    const bytes = bytesOf('x');
    const h = makeDeps({
      getObject: serves(bytes),
      finalize: async () => ({ ok: false, code: 'not_uploading' }),
    });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toEqual({ ok: false, status: 409, error: 'No se pudo confirmar el respaldo' });
    expect(h.callsOf('failOperation')[0].args).toEqual([MANIFEST, 'verification_failed']);
  });
});

describe('runBackupUpload · limpieza de versiones antiguas', () => {
  const pendingCleanup = [
    { manifestId: 'old-1', storagePath: 'path-1' },
    { manifestId: 'old-2', storagePath: 'path-2' },
    { manifestId: 'old-3', storagePath: 'path-3' },
  ];

  it('borra todas las versiones antiguas cuando todo va bien', async () => {
    const bytes = bytesOf('x');
    const h = makeDeps({
      getObject: serves(bytes),
      finalize: async () => ({ ok: true as const, pendingCleanup }),
    });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toMatchObject({ ok: true, cleanupPending: 0 });
    expect(h.callsOf('removeObject').map((c) => c.args[0])).toEqual(['path-1', 'path-2', 'path-3']);
    expect(h.callsOf('completeCleanup').map((c) => c.args[0])).toEqual(['old-1', 'old-2', 'old-3']);
  });

  it('cuenta como pendiente la que no se pudo borrar y sigue con las demás', async () => {
    const bytes = bytesOf('x');
    let removals = 0;
    const h = makeDeps({
      getObject: serves(bytes),
      finalize: async () => ({ ok: true as const, pendingCleanup }),
      removeObject: async () => ({ ok: ++removals !== 2 }), // la segunda falla
    });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toMatchObject({ ok: true, cleanupPending: 1 });
    // La fallida no llega a completeCleanup; las otras dos sí.
    expect(h.callsOf('completeCleanup').map((c) => c.args[0])).toEqual(['old-1', 'old-3']);
  });

  it('cuenta como pendiente la cuya marca de limpieza falla', async () => {
    const bytes = bytesOf('x');
    const h = makeDeps({
      getObject: serves(bytes),
      finalize: async () => ({ ok: true as const, pendingCleanup: pendingCleanup.slice(0, 1) }),
      completeCleanup: async () => ({ ok: false }),
    });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toMatchObject({ ok: true, cleanupPending: 1 });
    expect(h.callsOf('completeCleanup')).toHaveLength(1);
  });

  it('una limpieza fallida no convierte el respaldo en fallo', async () => {
    const bytes = bytesOf('x');
    const h = makeDeps({
      getObject: serves(bytes),
      finalize: async () => ({ ok: true as const, pendingCleanup }),
      removeObject: async () => ({ ok: false }),
      completeCleanup: async () => ({ ok: false }),
    });

    const result = await runBackupUpload(inputOf(bytes), h.deps);

    expect(result).toMatchObject({ ok: true, cleanupPending: 3 });
    expect(h.callsOf('failOperation')).toHaveLength(0);
  });
});

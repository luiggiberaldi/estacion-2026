import { describe, expect, it } from 'vitest';
import { chunk, selectAllPaged, selectInBatches, type RangeQuery } from '../src/lib/db-paging';

/** Cliente falso que imita PostgREST: corta cada lectura en `maxRows`. */
function fakeTable(total: number, maxRows = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const calls: Array<[number, number]> = [];
  const make = (filter: (r: { id: number }) => boolean = () => true): RangeQuery<{ id: number }> => ({
    range(from, to) {
      calls.push([from, to]);
      const filtered = rows.filter(filter);
      const end = Math.min(to + 1, from + maxRows);
      return Promise.resolve({ data: filtered.slice(from, end), error: null });
    },
  });
  return { make, calls };
}

describe('selectAllPaged', () => {
  it('trae las 2500 filas en 3 páginas, sin repetir ni saltar', async () => {
    const t = fakeTable(2500);
    const out = await selectAllPaged(() => t.make(), 'prueba');
    expect(out).toHaveLength(2500);
    expect(new Set(out.map((r) => r.id)).size).toBe(2500);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('justo 1000 filas: pide una página más y para', async () => {
    const t = fakeTable(1000);
    expect(await selectAllPaged(() => t.make(), 'prueba')).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it('tabla vacía', async () => {
    const t = fakeTable(0);
    expect(await selectAllPaged(() => t.make(), 'prueba')).toEqual([]);
  });

  it('si llega al tope de páginas lanza error en vez de truncar', async () => {
    const t = fakeTable(500);
    await expect(selectAllPaged(() => t.make(), 'prueba', 100, 3)).rejects.toThrow(/más de 300 filas/);
  });

  it('propaga el error de la base con su etiqueta', async () => {
    const q: RangeQuery<unknown> = {
      range: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
    };
    await expect(selectAllPaged(() => q, 'Error al obtener licencias')).rejects.toThrow('Error al obtener licencias: boom');
  });
});

describe('selectInBatches', () => {
  it('parte los valores en lotes de 200 y quita repetidos', async () => {
    const t = fakeTable(2500);
    const seen: number[] = [];
    const values = Array.from({ length: 450 }, (_, i) => String(i + 1)).concat(['1', '2']);
    const out = await selectInBatches(values, (batch) => {
      seen.push(batch.length);
      const set = new Set(batch.map(Number));
      return t.make((r) => set.has(r.id));
    }, 'prueba');
    expect(seen).toEqual([200, 200, 50]);
    expect(out).toHaveLength(450);
  });

  it('sin valores no consulta', async () => {
    let called = false;
    const out = await selectInBatches([], () => {
      called = true;
      return fakeTable(1).make();
    }, 'prueba');
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it('chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

// Lectura completa de tablas con PostgREST sin perder filas.
//
// Supabase corta cualquier select en `max_rows` (1000 por defecto) aunque se pida
// más con .limit(): sin paginar, al pasar de 1000 filas las listas se truncan en
// silencio. Este helper pide páginas con .range() hasta recibir una incompleta.
//
// Importante: la consulta debe llevar un orden estable (por ejemplo, la clave
// primaria). Si no, PostgREST puede devolver filas repetidas o saltarse filas
// entre páginas.

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 50;
export const IN_BATCH = 200;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

/** Algo a lo que se le puede pedir un rango: el builder de supabase-js. */
export interface RangeQuery<T> {
  range(from: number, to: number): PromiseLike<PageResult<T>>;
}

/**
 * Trae todas las filas de `makeQuery()`, página a página.
 * `makeQuery` debe crear una consulta nueva en cada llamada (los builders de
 * supabase-js no se pueden reutilizar tras ejecutarse).
 * Lanza un error si se alcanza el tope de páginas, en vez de truncar.
 */
export async function selectAllPaged<T>(
  makeQuery: () => RangeQuery<T>,
  label: string,
  pageSize: number = PAGE_SIZE,
  maxPages: number = MAX_PAGES
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error(`${label}: más de ${maxPages * pageSize} filas; se detuvo la lectura para no mostrar datos incompletos.`);
}

/** Parte una lista en lotes (para filtros `.in()` que no deben crecer sin límite). */
export function chunk<T>(items: T[], size: number = IN_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Trae las filas cuyo `column` está en `values`, en lotes de IN_BATCH valores
 * (la URL de PostgREST tiene límite de largo) y paginando cada lote.
 */
export async function selectInBatches<T>(
  values: string[],
  makeQuery: (batch: string[]) => RangeQuery<T>,
  label: string
): Promise<T[]> {
  const unique = [...new Set(values)];
  const out: T[] = [];
  for (const batch of chunk(unique)) {
    out.push(...(await selectAllPaged(() => makeQuery(batch), label)));
  }
  return out;
}

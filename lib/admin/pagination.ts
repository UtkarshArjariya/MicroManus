import "server-only";

const PAGE_SIZE = 1_000;
const MAX_PAGES = 10_000;

type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

/**
 * PostgREST projects commonly cap one response at 1,000 rows. Admin totals and
 * history views must not silently become partial when the application grows.
 */
export async function loadAllPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const result = await loadPage(from, from + PAGE_SIZE - 1);

    if (result.error) throw result.error;

    const pageRows = result.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return rows;
  }

  throw new Error("Admin query exceeded the safe pagination limit.");
}

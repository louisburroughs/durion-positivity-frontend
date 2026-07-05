/**
 * Minimal shape of a Spring Data `Page` response body — only the `content`
 * array is needed to narrow the paged reference-data endpoints that the
 * generated SDK types loosely as `Observable<string>`.
 */
export interface SpringPage<T> {
  content?: T[];
}

/**
 * Extracts the row array from a paged reference-data response. Accepts either a
 * Spring `Page` (rows under `content`) or a plain array (some endpoints return
 * one directly). Returns an empty array when neither is present.
 */
export function pageContent<T>(page: unknown): T[] {
  if (Array.isArray(page)) {
    return page as T[];
  }
  return (page as SpringPage<T>)?.content ?? [];
}

/** Short random id for client-created entities (server also has its own). */
export function nanoIdish(): string {
  return Math.random().toString(36).slice(2, 10);
}

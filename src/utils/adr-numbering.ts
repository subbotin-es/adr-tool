// SC-011: Known race condition — not atomic. Two concurrent push-github calls can receive the
// same max number and collide. Probability negligible at 10-20 req/day. The UNIQUE constraint
// on adrs.adr_id will surface the collision as a 409. Migration path: Durable Object counter in v2.

export function formatADRId(num: number): string {
  return `ADR-${String(num).padStart(4, '0')}`;
}

export function nextADRId(currentMax: number | null): string {
  return formatADRId((currentMax ?? 0) + 1);
}

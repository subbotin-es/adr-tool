import { describe, it, expect } from 'vitest';
import { formatADRId, nextADRId } from '../../src/utils/adr-numbering';

describe('formatADRId — 4-digit minimum padding', () => {
  it('formats 1 as ADR-0001', () => {
    expect(formatADRId(1)).toBe('ADR-0001');
  });

  it('formats 42 as ADR-0042', () => {
    expect(formatADRId(42)).toBe('ADR-0042');
  });

  it('formats 100 as ADR-0100', () => {
    expect(formatADRId(100)).toBe('ADR-0100');
  });

  it('formats 999 as ADR-0999', () => {
    expect(formatADRId(999)).toBe('ADR-0999');
  });

  it('formats 1000 as ADR-1000 (grows beyond 4 digits)', () => {
    expect(formatADRId(1000)).toBe('ADR-1000');
  });

  it('formats 9999 as ADR-9999', () => {
    expect(formatADRId(9999)).toBe('ADR-9999');
  });

  it('formats 10000 as ADR-10000 (5 digits, grows naturally)', () => {
    expect(formatADRId(10000)).toBe('ADR-10000');
  });
});

describe('nextADRId — increments from current max', () => {
  it('returns ADR-0001 when no ADRs exist (null)', () => {
    expect(nextADRId(null)).toBe('ADR-0001');
  });

  it('returns ADR-0002 when current max is 1', () => {
    expect(nextADRId(1)).toBe('ADR-0002');
  });

  it('returns ADR-0043 when current max is 42', () => {
    expect(nextADRId(42)).toBe('ADR-0043');
  });

  it('returns ADR-1001 when current max is 1000', () => {
    expect(nextADRId(1000)).toBe('ADR-1001');
  });
});

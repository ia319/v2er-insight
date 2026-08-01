import { describe, expect, it } from 'vitest';
import {
  createResultDeliveryId,
  formatResultVersionId,
  isResultDeliveryId,
  isResultVersionId,
  parseResultVersionId,
} from '../identifiers';

describe('result version identifiers', () => {
  it('formats and parses canonical version IDs', () => {
    expect(formatResultVersionId(1)).toBe('v000001');
    expect(formatResultVersionId(1_000_000)).toBe('v1000000');
    expect(parseResultVersionId('v000001')).toBe(1);
    expect(parseResultVersionId('v1000000')).toBe(1_000_000);
  });

  it.each(['v1', 'v000000', 'v0000001', '../v000001', 'V000001'])(
    'rejects non-canonical version ID %s',
    (value) => {
      expect(isResultVersionId(value)).toBe(false);
      expect(parseResultVersionId(value)).toBeNull();
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid sequence %s', (sequence) => {
    expect(() => formatResultVersionId(sequence)).toThrow(RangeError);
  });

  it('creates lowercase UUID delivery IDs', () => {
    expect(isResultDeliveryId(createResultDeliveryId())).toBe(true);
  });
});

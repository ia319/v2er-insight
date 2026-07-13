import { describe, expect, it } from 'vitest';

import { canonicalJsonStringify, hashCanonicalJson } from '../canonical-json';

describe('canonicalJsonStringify', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(canonicalJsonStringify({ z: 1, nested: { b: 2, a: 1 }, items: [{ y: 2, x: 1 }] })).toBe(
      '{"items":[{"x":1,"y":2}],"nested":{"a":1,"b":2},"z":1}',
    );
  });

  it('produces the same hash for equivalent object key orders', () => {
    expect(hashCanonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      hashCanonicalJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, undefined, 1n])(
    'rejects unsupported value %s',
    (value) => {
      expect(() => canonicalJsonStringify(value)).toThrow(TypeError);
    },
  );

  it('rejects circular values', () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(() => canonicalJsonStringify(value)).toThrow('circular');
  });
});

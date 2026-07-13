import { createHash } from 'node:crypto';

type CanonicalJsonPrimitive = boolean | number | string | null;
type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function normalizeJsonValue(value: unknown, ancestors: WeakSet<object>): CanonicalJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON does not support non-finite numbers');
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new TypeError(`Canonical JSON does not support ${typeof value} values`);
  }

  if (ancestors.has(value)) {
    throw new TypeError('Canonical JSON does not support circular values');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeJsonValue(item, ancestors));
    }

    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON only supports plain objects and arrays');
    }

    const record = value as Record<string, unknown>;
    const normalized: Record<string, CanonicalJsonValue> = Object.create(null) as Record<
      string,
      CanonicalJsonValue
    >;

    for (const key of Object.keys(record).sort()) {
      normalized[key] = normalizeJsonValue(record[key], ancestors);
    }

    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

/** Serialize JSON-compatible data with recursively sorted object keys. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value, new WeakSet<object>()));
}

/** Compute a SHA-256 hex digest from canonical JSON data. */
export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJsonStringify(value), 'utf8').digest('hex');
}

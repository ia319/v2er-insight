import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

vi.mock('fs');

import { readJsonFileSnapshot } from '../read-state';

describe('readJsonFileSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves file states and content identities', () => {
    const missingError = Object.assign(new Error('missing'), { code: 'ENOENT' });
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw missingError;
    });
    const missing = readJsonFileSnapshot('missing.json', () => undefined);
    expect(missing.state).toEqual({
      status: 'missing',
    });
    expect(missing.identity).toBe('missing');

    vi.mocked(fs.readFileSync).mockReturnValueOnce('{invalid' as never);
    expect(readJsonFileSnapshot('invalid.json', () => undefined).state).toEqual({
      status: 'invalid',
      reason: 'json',
    });

    vi.mocked(fs.readFileSync).mockReturnValueOnce('{"value":1}' as never);
    expect(readJsonFileSnapshot('unsupported.json', () => undefined).state).toEqual({
      status: 'invalid',
      reason: 'contract',
    });

    const unreadableError = Object.assign(new Error('denied'), { code: 'EACCES' });
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw unreadableError;
    });
    expect(readJsonFileSnapshot('unreadable.json', () => undefined).state).toEqual({
      status: 'unreadable',
      error: unreadableError,
    });

    vi.mocked(fs.readFileSync).mockReturnValue('{"value":1}' as never);
    const first = readJsonFileSnapshot('valid.json', (value) =>
      typeof value === 'object' && value !== null ? value : undefined,
    );
    const same = readJsonFileSnapshot('valid.json', (value) =>
      typeof value === 'object' && value !== null ? value : undefined,
    );
    expect(first.state).toEqual({ status: 'valid', value: { value: 1 } });
    expect(same.identity).toBe(first.identity);

    vi.mocked(fs.readFileSync).mockReturnValue('{"value":2}' as never);
    const changed = readJsonFileSnapshot('valid.json', (value) =>
      typeof value === 'object' && value !== null ? value : undefined,
    );
    expect(changed.identity).not.toBe(first.identity);
  });
});

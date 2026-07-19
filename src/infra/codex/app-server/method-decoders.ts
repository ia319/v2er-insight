import { CodexAppServerProtocolError } from './errors';
import type {
  CodexAccountStatus,
  CodexModelInfo,
  CodexModelPage,
  CodexReasoningEffortOption,
  CodexServerInfo,
} from './method-types';

function fail(path: string, expected: string): never {
  throw new CodexAppServerProtocolError(`Expected ${expected} at ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) return fail(path, 'object');
  return value;
}

function expectString(value: unknown, path: string, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    return fail(path, allowEmpty ? 'string' : 'non-empty string');
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'boolean');
  return value;
}

function decodeReasoningEffort(value: unknown, path: string): CodexReasoningEffortOption {
  const record = expectRecord(value, path);
  return {
    reasoningEffort: expectString(record.reasoningEffort, `${path}.reasoningEffort`, false),
    description: expectString(record.description, `${path}.description`),
  };
}

function decodeModel(value: unknown, path: string): CodexModelInfo {
  const record = expectRecord(value, path);
  if (!Array.isArray(record.supportedReasoningEfforts)) {
    return fail(`${path}.supportedReasoningEfforts`, 'array');
  }

  return {
    id: expectString(record.id, `${path}.id`, false),
    model: expectString(record.model, `${path}.model`, false),
    displayName: expectString(record.displayName, `${path}.displayName`),
    description: expectString(record.description, `${path}.description`),
    hidden: expectBoolean(record.hidden, `${path}.hidden`),
    isDefault: expectBoolean(record.isDefault, `${path}.isDefault`),
    defaultReasoningEffort: expectString(
      record.defaultReasoningEffort,
      `${path}.defaultReasoningEffort`,
      false,
    ),
    supportedReasoningEfforts: record.supportedReasoningEfforts.map((effort, index) =>
      decodeReasoningEffort(effort, `${path}.supportedReasoningEfforts[${index}]`),
    ),
  };
}

/** Decodes the result of the App Server `initialize` request. */
export function decodeInitializeResponse(value: unknown): CodexServerInfo {
  const record = expectRecord(value, 'initialize.result');
  return {
    userAgent: expectString(record.userAgent, 'initialize.result.userAgent', false),
    codexHome: expectString(record.codexHome, 'initialize.result.codexHome', false),
    platformFamily: expectString(record.platformFamily, 'initialize.result.platformFamily', false),
    platformOs: expectString(record.platformOs, 'initialize.result.platformOs', false),
  };
}

/** Decodes account state without retaining account identity fields. */
export function decodeAccountReadResponse(value: unknown): CodexAccountStatus {
  const record = expectRecord(value, 'account/read.result');
  const requiresOpenaiAuth = expectBoolean(
    record.requiresOpenaiAuth,
    'account/read.result.requiresOpenaiAuth',
  );
  if (record.account === null) return { accountType: null, requiresOpenaiAuth };

  const account = expectRecord(record.account, 'account/read.result.account');
  return {
    accountType: expectString(account.type, 'account/read.result.account.type', false),
    requiresOpenaiAuth,
  };
}

/** Decodes one page returned by `model/list`. */
export function decodeModelListResponse(value: unknown): CodexModelPage {
  const record = expectRecord(value, 'model/list.result');
  if (!Array.isArray(record.data)) return fail('model/list.result.data', 'array');
  if (record.nextCursor !== null && typeof record.nextCursor !== 'string') {
    return fail('model/list.result.nextCursor', 'string or null');
  }

  return {
    data: record.data.map((model, index) => decodeModel(model, `model/list.result.data[${index}]`)),
    nextCursor: record.nextCursor,
  };
}

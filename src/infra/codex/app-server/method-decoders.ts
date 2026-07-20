import type {
  CodexAccountStatus,
  CodexModelInfo,
  CodexModelPage,
  CodexReasoningEffortOption,
  CodexServerInfo,
} from './method-types';
import {
  expectArray,
  expectBoolean,
  expectNullableString,
  expectRecord,
  expectString,
} from './value-decoder';

function decodeReasoningEffort(value: unknown, path: string): CodexReasoningEffortOption {
  const record = expectRecord(value, path);
  return {
    reasoningEffort: expectString(record.reasoningEffort, `${path}.reasoningEffort`, false),
    description: expectString(record.description, `${path}.description`),
  };
}

function decodeModel(value: unknown, path: string): CodexModelInfo {
  const record = expectRecord(value, path);
  const supportedReasoningEfforts = expectArray(
    record.supportedReasoningEfforts,
    `${path}.supportedReasoningEfforts`,
  );

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
    supportedReasoningEfforts: supportedReasoningEfforts.map((effort, index) =>
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

/** Decodes the account type and authentication availability state. */
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
  const data = expectArray(record.data, 'model/list.result.data');
  const nextCursor = expectNullableString(record.nextCursor, 'model/list.result.nextCursor');

  return {
    data: data.map((model, index) => decodeModel(model, `model/list.result.data[${index}]`)),
    nextCursor,
  };
}

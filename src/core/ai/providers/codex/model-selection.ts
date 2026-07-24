import {
  CODEX_DEFAULT_MODEL,
  CODEX_DEFAULT_REASONING_EFFORT,
  type CodexProviderConfig,
} from '@/config';
import type { CodexModelInfo } from '@/infra/codex';

export type CodexModelSelectionErrorCode =
  | 'catalog_empty'
  | 'default_model_missing'
  | 'default_model_ambiguous'
  | 'model_unavailable'
  | 'model_efforts_invalid'
  | 'effort_unsupported';

export class CodexModelSelectionError extends Error {
  readonly code: CodexModelSelectionErrorCode;

  constructor(code: CodexModelSelectionErrorCode, message: string) {
    super(message);
    this.name = 'CodexModelSelectionError';
    this.code = code;
  }
}

export interface ResolvedCodexModel {
  catalogId: string;
  model: string;
  displayName: string;
  reasoningEffort: string;
}

function selectModel(models: readonly CodexModelInfo[], requested: string): CodexModelInfo {
  if (models.length === 0) {
    throw new CodexModelSelectionError(
      'catalog_empty',
      'Codex App Server returned no visible models',
    );
  }

  if (requested === CODEX_DEFAULT_MODEL) {
    const defaults = models.filter((model) => model.isDefault);
    if (defaults.length === 0) {
      throw new CodexModelSelectionError(
        'default_model_missing',
        'Codex model catalog has no default model',
      );
    }
    if (defaults.length > 1) {
      throw new CodexModelSelectionError(
        'default_model_ambiguous',
        'Codex model catalog has multiple default models',
      );
    }
    const selected = defaults[0];
    if (!selected) {
      throw new CodexModelSelectionError(
        'default_model_missing',
        'Codex model catalog has no default model',
      );
    }
    return selected;
  }

  const matches = models.filter((model) => model.model === requested);
  if (matches.length !== 1) {
    throw new CodexModelSelectionError(
      'model_unavailable',
      `Codex model "${requested}" is not uniquely available`,
    );
  }
  const selected = matches[0];
  if (!selected) {
    throw new CodexModelSelectionError(
      'model_unavailable',
      `Codex model "${requested}" is not uniquely available`,
    );
  }
  return selected;
}

function selectEffort(model: CodexModelInfo, requested: string): string {
  const supported = model.supportedReasoningEfforts.map((option) => option.reasoningEffort);
  const uniqueSupported = new Set(supported);
  if (uniqueSupported.size !== supported.length || supported.length === 0) {
    throw new CodexModelSelectionError(
      'model_efforts_invalid',
      `Codex model "${model.model}" returned an invalid reasoning effort catalog`,
    );
  }

  const effort =
    requested === CODEX_DEFAULT_REASONING_EFFORT ? model.defaultReasoningEffort : requested;
  if (!uniqueSupported.has(effort)) {
    throw new CodexModelSelectionError(
      'effort_unsupported',
      `Codex model "${model.model}" does not support reasoning effort "${effort}"`,
    );
  }
  return effort;
}

/**
 * Resolves semantic Codex defaults against one live App Server model catalog.
 * @param models - Visible models returned by the active connection.
 * @param config - Codex model and effort selectors.
 * @returns Concrete model identity and supported reasoning effort.
 */
export function resolveCodexModel(
  models: readonly CodexModelInfo[],
  config: Pick<CodexProviderConfig, 'model' | 'reasoningEffort'>,
): ResolvedCodexModel {
  const requestedModel = config.model ?? CODEX_DEFAULT_MODEL;
  const requestedEffort = config.reasoningEffort ?? CODEX_DEFAULT_REASONING_EFFORT;
  const selectedModel = selectModel(models, requestedModel);

  return {
    catalogId: selectedModel.id,
    model: selectedModel.model,
    displayName: selectedModel.displayName,
    reasoningEffort: selectEffort(selectedModel, requestedEffort),
  };
}

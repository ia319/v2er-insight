import { describe, expect, it } from 'vitest';
import type { CodexModelInfo } from '@/infra/codex';
import { CodexModelSelectionError, resolveCodexModel } from '../model-selection';

const defaultModel = createModel('default-model', true, 'low', ['low', 'high']);
const otherModel = createModel('other-model', false, 'medium', ['low', 'medium']);

describe('resolveCodexModel', () => {
  it('should resolve App and model defaults from the live catalog', () => {
    expect(resolveCodexModel([defaultModel, otherModel], {})).toEqual({
      catalogId: 'default-model',
      model: 'default-model',
      displayName: 'default-model',
      reasoningEffort: 'low',
    });
  });

  it('should honor exact model and supported effort selections', () => {
    expect(
      resolveCodexModel([defaultModel, otherModel], {
        model: 'other-model',
        reasoningEffort: 'medium',
      }),
    ).toMatchObject({ model: 'other-model', reasoningEffort: 'medium' });
  });

  it('should reject missing or ambiguous default models', () => {
    expectSelectionError(() => resolveCodexModel([otherModel], {}), 'default_model_missing');
    expectSelectionError(
      () => resolveCodexModel([defaultModel, { ...otherModel, isDefault: true }], {}),
      'default_model_ambiguous',
    );
  });

  it('should reject unsupported reasoning efforts', () => {
    expectSelectionError(
      () => resolveCodexModel([defaultModel], { reasoningEffort: 'ultra' }),
      'effort_unsupported',
    );
  });
});

function expectSelectionError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CodexModelSelectionError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected CodexModelSelectionError with code ${code}`);
}

function createModel(
  model: string,
  isDefault: boolean,
  defaultReasoningEffort: string,
  efforts: string[],
): CodexModelInfo {
  return {
    id: model,
    model,
    displayName: model,
    description: '',
    hidden: false,
    isDefault,
    defaultReasoningEffort,
    supportedReasoningEfforts: efforts.map((reasoningEffort) => ({
      reasoningEffort,
      description: '',
    })),
  };
}

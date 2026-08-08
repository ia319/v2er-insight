import { describe, expect, it } from 'vitest';
import type { CodexTurnInfo } from '@/infra/codex';
import {
  CodexTurnResultError,
  assertCodexTurnCompleted,
  selectCodexFinalMessage,
} from '../turn-result';

function createTurn(overrides: Partial<CodexTurnInfo> = {}): CodexTurnInfo {
  return {
    id: 'turn-1',
    status: 'completed',
    error: null,
    agentMessages: [],
    ...overrides,
  };
}

describe('Codex turn result', () => {
  it('should accept completed prompt turns without requiring response text', () => {
    expect(() => assertCodexTurnCompleted(createTurn())).not.toThrow();
  });

  it.each([
    ['inProgress', 'turn_in_progress'],
    ['interrupted', 'turn_interrupted'],
    ['failed', 'turn_failed'],
  ] as const)('should reject %s turns', (status, code) => {
    const turn = createTurn({
      status,
      error:
        status === 'failed'
          ? {
              message: 'request failed',
              codexErrorInfo: 'contextWindowExceeded',
              additionalDetails: null,
            }
          : null,
    });
    try {
      assertCodexTurnCompleted(turn);
      throw new Error('Expected turn rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(CodexTurnResultError);
      expect(error).toMatchObject({
        code,
        turnId: 'turn-1',
        codexErrorInfo: status === 'failed' ? 'contextWindowExceeded' : null,
      });
    }
  });

  it('should prefer the last non-empty final answer', () => {
    const message = selectCodexFinalMessage(
      createTurn({
        agentMessages: [
          { id: 'commentary', text: 'working', phase: 'commentary' },
          { id: 'first-final', text: 'first', phase: 'final_answer' },
          { id: 'empty-final', text: '   ', phase: 'final_answer' },
          { id: 'last-final', text: 'last', phase: 'final_answer' },
        ],
      }),
    );
    expect(message).toMatchObject({ id: 'last-final', text: 'last' });
  });

  it('should use the last phase-null message for compatible models', () => {
    const message = selectCodexFinalMessage(
      createTurn({
        agentMessages: [
          { id: 'first', text: 'first', phase: null },
          { id: 'commentary', text: 'working', phase: 'commentary' },
          { id: 'last', text: 'last', phase: null },
        ],
      }),
    );
    expect(message.id).toBe('last');
  });

  it('should reject commentary-only or empty responses', () => {
    expect(() =>
      selectCodexFinalMessage(
        createTurn({
          agentMessages: [
            { id: 'commentary', text: 'working', phase: 'commentary' },
            { id: 'empty', text: '', phase: null },
          ],
        }),
      ),
    ).toThrow(CodexTurnResultError);
  });
});

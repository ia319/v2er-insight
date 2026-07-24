import { describe, expect, it } from 'vitest';
import { isUnexpectedTurnAction } from '../turn-action';

describe('Codex turn action policy', () => {
  it('should allow analysis-only item types', () => {
    for (const itemType of [
      'userMessage',
      'agentMessage',
      'plan',
      'reasoning',
      'contextCompaction',
    ]) {
      expect(isUnexpectedTurnAction(itemType)).toBe(false);
    }
  });

  it('should reject execution and unknown item types', () => {
    expect(isUnexpectedTurnAction('commandExecution')).toBe(true);
    expect(isUnexpectedTurnAction('mcpToolCall')).toBe(true);
    expect(isUnexpectedTurnAction('futureExecutionItem')).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { CodexAppServerProtocolError, CodexTurnWaitTimeoutError } from '../errors';
import { CodexTurnCompletionCollector } from '../turn-completion';

describe('CodexTurnCompletionCollector', () => {
  it('should preserve a completion received before waiting', async () => {
    const collector = new CodexTurnCompletionCollector('thread-1');
    collector.accept({
      kind: 'turnCompleted',
      threadId: 'thread-1',
      turn: { id: 'turn-1', status: 'completed', error: null, agentMessages: [] },
    });

    await expect(collector.waitFor('turn-1', 1000)).resolves.toMatchObject({
      id: 'turn-1',
      status: 'completed',
    });
  });

  it('should merge completed agent items into the terminal turn', async () => {
    const collector = new CodexTurnCompletionCollector('thread-1');
    const waiting = collector.waitFor('turn-1', 1000);
    collector.accept({
      kind: 'itemCompleted',
      threadId: 'thread-1',
      turnId: 'turn-1',
      message: { id: 'message-1', text: 'done', phase: 'final_answer' },
    });
    collector.accept({
      kind: 'turnCompleted',
      threadId: 'thread-1',
      turn: { id: 'turn-1', status: 'completed', error: null, agentMessages: [] },
    });

    await expect(waiting).resolves.toMatchObject({
      agentMessages: [{ id: 'message-1', text: 'done', phase: 'final_answer' }],
    });
  });

  it('should reject in-progress completion events and decoder failures', async () => {
    const collector = new CodexTurnCompletionCollector('thread-1');
    expect(() =>
      collector.accept({
        kind: 'turnCompleted',
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'inProgress', error: null, agentMessages: [] },
      }),
    ).toThrow(CodexAppServerProtocolError);

    const error = new CodexAppServerProtocolError('invalid notification');
    collector.fail(error);
    await expect(collector.waitFor('turn-1', 1000)).rejects.toBe(error);
  });

  it('should apply an independent turn completion deadline', async () => {
    vi.useFakeTimers();
    try {
      const collector = new CodexTurnCompletionCollector('thread-1');
      const waiting = collector.waitFor('turn-1', 25);
      const rejection = expect(waiting).rejects.toBeInstanceOf(CodexTurnWaitTimeoutError);
      await vi.advanceTimersByTimeAsync(25);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { CodexAppServerProtocolError } from '../errors';
import { decodeSessionNotification } from '../notification-decoder';

describe('App Server session notification decoder', () => {
  it('should decode completed turns and their agent messages', () => {
    expect(
      decodeSessionNotification({
        method: 'turn/completed',
        params: {
          threadId: 'thread-1',
          turn: {
            id: 'turn-1',
            status: 'completed',
            error: null,
            items: [{ type: 'agentMessage', id: 'message-1', text: 'done', phase: 'final_answer' }],
          },
        },
      }),
    ).toEqual({
      kind: 'turnCompleted',
      threadId: 'thread-1',
      turn: {
        id: 'turn-1',
        status: 'completed',
        error: null,
        agentMessages: [{ id: 'message-1', text: 'done', phase: 'final_answer' }],
      },
    });
  });

  it('should retain completed agent message items and ignore other item variants', () => {
    expect(
      decodeSessionNotification({
        method: 'item/completed',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          completedAtMs: 1,
          item: { type: 'agentMessage', id: 'message-1', text: 'done', phase: null },
        },
      }),
    ).toMatchObject({
      kind: 'itemCompleted',
      message: { id: 'message-1', text: 'done', phase: null },
    });

    expect(
      decodeSessionNotification({
        method: 'item/completed',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          completedAtMs: 1,
          item: { type: 'reasoning', id: 'reasoning-1', summary: [], content: [] },
        },
      }),
    ).toMatchObject({ kind: 'itemCompleted', message: null });
  });

  it('should decode deltas, retry errors, and thread status changes', () => {
    expect(
      decodeSessionNotification({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'message-1',
          delta: 'part',
        },
      }),
    ).toMatchObject({ kind: 'agentMessageDelta', delta: 'part' });

    expect(
      decodeSessionNotification({
        method: 'error',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          willRetry: true,
          error: { message: 'temporary', codexErrorInfo: 'other', additionalDetails: null },
        },
      }),
    ).toMatchObject({ kind: 'turnError', willRetry: true, error: { message: 'temporary' } });

    expect(
      decodeSessionNotification({
        method: 'thread/status/changed',
        params: { threadId: 'thread-1', status: { type: 'active', activeFlags: [] } },
      }),
    ).toEqual({
      kind: 'threadStatusChanged',
      threadId: 'thread-1',
      status: { type: 'active', activeFlags: [] },
    });
  });

  it('should ignore unrelated notifications and reject malformed known methods', () => {
    expect(decodeSessionNotification({ method: 'account/updated', params: {} })).toBeNull();
    expect(() =>
      decodeSessionNotification({
        method: 'turn/completed',
        params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'done' } },
      }),
    ).toThrow(CodexAppServerProtocolError);
  });
});

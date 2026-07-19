import { describe, expect, it } from 'vitest';
import { CodexAppServerProtocolError } from '../errors';
import {
  decodeThreadReadResponse,
  decodeThreadSetNameResponse,
  decodeThreadStartResponse,
  decodeTurnStartResponse,
} from '../thread-decoders';

function createTurn() {
  return {
    id: 'turn-1',
    status: 'completed',
    error: null,
    items: [
      { type: 'reasoning', id: 'reasoning-1', summary: [], content: [] },
      { type: 'agentMessage', id: 'message-1', text: 'done', phase: 'final_answer' },
    ],
  };
}

function createThread() {
  return {
    id: 'thread-1',
    name: 'alice-insight',
    cwd: 'D:\\data',
    status: { type: 'idle' },
    turns: [createTurn()],
  };
}

describe('App Server thread decoders', () => {
  it('should decode thread session fields required by the provider', () => {
    expect(
      decodeThreadStartResponse({
        thread: createThread(),
        model: 'gpt-current',
        cwd: 'D:\\data',
        instructionSources: ['D:\\data\\AGENTS.md'],
        reasoningEffort: 'high',
      }),
    ).toEqual({
      thread: {
        id: 'thread-1',
        name: 'alice-insight',
        cwd: 'D:\\data',
        status: { type: 'idle' },
        turns: [
          {
            id: 'turn-1',
            status: 'completed',
            error: null,
            agentMessages: [{ id: 'message-1', text: 'done', phase: 'final_answer' }],
          },
        ],
      },
      model: 'gpt-current',
      cwd: 'D:\\data',
      instructionSources: ['D:\\data\\AGENTS.md'],
      reasoningEffort: 'high',
    });
  });

  it('should decode active thread flags and failed turn details', () => {
    const thread = {
      ...createThread(),
      status: { type: 'active', activeFlags: ['waitingOnUserInput'] },
      turns: [
        {
          ...createTurn(),
          status: 'failed',
          error: { message: 'request failed', codexErrorInfo: 'other', additionalDetails: null },
        },
      ],
    };

    expect(decodeThreadReadResponse({ thread })).toMatchObject({
      status: { type: 'active', activeFlags: ['waitingOnUserInput'] },
      turns: [
        {
          status: 'failed',
          error: { message: 'request failed', additionalDetails: null },
        },
      ],
    });
  });

  it('should decode the initial turn returned by turn/start', () => {
    expect(
      decodeTurnStartResponse({
        turn: { id: 'turn-2', status: 'inProgress', error: null, items: [] },
      }),
    ).toEqual({ id: 'turn-2', status: 'inProgress', error: null, agentMessages: [] });
  });

  it('should reject unknown turn states and message phases', () => {
    expect(() =>
      decodeTurnStartResponse({
        turn: { id: 'turn-2', status: 'pending', error: null, items: [] },
      }),
    ).toThrow(CodexAppServerProtocolError);

    const turn = {
      ...createTurn(),
      items: [{ type: 'agentMessage', id: 'message-1', text: 'done', phase: 'analysis' }],
    };
    expect(() => decodeTurnStartResponse({ turn })).toThrow(CodexAppServerProtocolError);
  });

  it('should require an object result from thread/name/set', () => {
    expect(decodeThreadSetNameResponse({})).toBeUndefined();
    expect(() => decodeThreadSetNameResponse(null)).toThrow(CodexAppServerProtocolError);
  });
});

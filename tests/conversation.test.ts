import { describe, it, expect } from 'vitest';
import { runTurn } from '../utils/conversation';
import type { Conversation } from '../utils/ai/types';
import type { PortMessage } from '../utils/messages';

function recorder() {
  const messages: PortMessage[] = [];
  return { messages, post: (m: PortMessage) => messages.push(m) };
}

describe('runTurn', () => {
  it('forwards status + chunks, then done, in order', async () => {
    const convo: Conversation = {
      async send(_userMessage, ev) {
        ev.onStatus('loading');
        ev.onChunk('Hello');
        ev.onChunk(' world');
      },
    };
    const { messages, post } = recorder();
    await runTurn(convo, 'hi', post);
    expect(messages).toEqual([
      { type: 'status', message: 'loading' },
      { type: 'chunk', text: 'Hello' },
      { type: 'chunk', text: ' world' },
      { type: 'done' },
    ]);
  });

  it('posts the error message when send throws an Error', async () => {
    const convo: Conversation = {
      async send() {
        throw new Error('boom');
      },
    };
    const { messages, post } = recorder();
    await runTurn(convo, 'hi', post);
    expect(messages).toEqual([{ type: 'error', message: 'boom' }]);
  });

  it('uses a generic message for non-Error throws', async () => {
    const convo: Conversation = {
      async send() {
        throw 'nope';
      },
    };
    const { messages, post } = recorder();
    await runTurn(convo, 'hi', post);
    expect(messages).toEqual([
      { type: 'error', message: 'Something went wrong.' },
    ]);
  });

  it('passes the user message through to the conversation', async () => {
    const seen: string[] = [];
    const convo: Conversation = {
      async send(text) {
        seen.push(text);
      },
    };
    const { post } = recorder();
    await runTurn(convo, 'define this', post);
    expect(seen).toEqual(['define this']);
  });
});

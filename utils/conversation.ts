// Runs one conversation turn and reports it over the port: status + chunks,
// then done, or an error. Provider-agnostic and side-effect-free (post is
// injected), so it's testable with a fake conversation.

import type { Conversation } from './ai/types';
import type { PortMessage } from './messages';

export async function runTurn(
  conversation: Conversation,
  userMessage: string,
  post: (message: PortMessage) => void,
): Promise<void> {
  try {
    await conversation.send(userMessage, {
      onStatus: (message) => post({ type: 'status', message }),
      onChunk: (text) => post({ type: 'chunk', text }),
    });
    post({ type: 'done' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Something went wrong.';
    post({ type: 'error', message });
  }
}

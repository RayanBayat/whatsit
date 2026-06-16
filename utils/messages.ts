// Wire protocol between the injected overlay (content) and the background.

// background -> overlay, telling it to capture the selection and start a chat.
export interface StartMessage {
  type: 'whatsit:start';
}

// overlay -> background, first message: the initial lookup of the selection.
export interface LookupMessage {
  type: 'lookup';
  word: string;
  context: string;
  title: string;
}

// overlay -> background: a follow-up question in the same conversation.
export interface AskMessage {
  type: 'ask';
  text: string;
}

export type ConversationRequest = LookupMessage | AskMessage;

// background -> overlay, streamed over the port during a turn.
export type PortMessage =
  | { type: 'status'; message: string }
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const PORT_NAME = 'whatsit';

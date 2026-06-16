// The seam between the browser-agnostic background logic and the per-browser
// on-device model. Each browser ships exactly one implementation; the rest of
// the extension only ever sees these interfaces.

export interface LookupRequest {
  word: string;
  context: string;
  title: string;
}

export interface ProviderEvents {
  /** Transient status (e.g. one-time model download progress). */
  onStatus(message: string): void;
  /** A piece of the answer. May be called once (whole answer) or many (stream). */
  onChunk(text: string): void;
}

/**
 * A multi-turn chat with the on-device model. The provider keeps whatever state
 * it needs between turns (Chrome: a live session; Firefox: message history).
 */
export interface Conversation {
  /** Send one user turn; stream the reply through `events`. Throws on failure. */
  send(userMessage: string, events: ProviderEvents): Promise<void>;
  /** Release per-conversation resources (e.g. a cloned session). */
  dispose?(): void;
}

/** A model the user can see / pick in the popup. */
export interface ManagedModel {
  id: string;
  label: string;
  size: string;
  detail?: string;
}

/**
 * Optional model-management surface, exposed in the toolbar popup. Firefox
 * implements all of it (pick / download / delete). Chrome implements a reduced
 * form — a single, Chrome-managed Nano model it can download but not select or
 * delete (hence the capability flags).
 */
export interface ModelManager {
  readonly engineLabel: string;
  readonly canSelectModel: boolean;
  readonly canDelete: boolean;
  listModels(): ManagedModel[];
  getActiveModelId(): Promise<string>;
  setActiveModelId(id: string): Promise<void>;
  /** Best-effort: has the active model been downloaded already? */
  isDownloaded(): Promise<boolean>;
  /** Trigger the download, reporting 0-100 progress. Resolves when ready. */
  download(onProgress: (percent: number) => void): Promise<void>;
  deleteCache(): Promise<void>;
  /** Engine-specific diagnostics (label → value) for the options page. */
  describe?(): Promise<Record<string, string>>;
}

export interface AiProvider {
  /** Warm the model so the first turn is fast. Best-effort; never throws. */
  prewarm?(): void;
  /**
   * Request any permission the provider needs. MUST run inside a user gesture.
   * Returns whether access is granted. Omit if the provider needs none.
   */
  requestAccess?(): Promise<boolean>;
  /** Start a multi-turn conversation (reads the active prompt + model). */
  startConversation(): Promise<Conversation>;
  /** Model management for the popup. Omit if the browser exposes none. */
  manager?: ModelManager;
}

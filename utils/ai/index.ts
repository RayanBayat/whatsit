import type { AiProvider } from './types';
import { chromeProvider } from './chrome';
import { firefoxProvider } from './firefox';

// import.meta.env.FIREFOX is a build-time constant, so the unused provider (and
// its browser-specific API references) is tree-shaken out of each bundle.
export const provider: AiProvider = import.meta.env.FIREFOX
  ? firefoxProvider
  : chromeProvider;

export type { AiProvider, LookupRequest, ProviderEvents } from './types';

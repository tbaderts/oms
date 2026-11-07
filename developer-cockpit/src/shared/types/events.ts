export type EventType =
  | 'file:changed'
  | 'file:created'
  | 'file:deleted'
  | 'config:changed'
  | 'kb:updated'
  | 'git:changed'
  | 'specs:tickets-changed'
  | 'storyboards:changed'
  | 'connection:status'
  // AI (SPEC-0042): the assistant's streaming events. The payload is the matching `AiEvent`
  // (see shared/types/ai.ts); the `runId` in the payload scopes each event to a run.
  | 'ai:message'
  | 'ai:tool-call'
  | 'ai:tool-result'
  | 'ai:done'
  | 'ai:error';

export interface CockpitEvent<T = unknown> {
  type: EventType;
  timestamp: number;
  payload: T;
}

export interface FileChangePayload {
  path: string;
  kind: 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir';
}

/** Something under specs/changes or specs/archive changed; payload is the last changed path. */
export interface SpecTicketsChangedPayload {
  path: string;
}

/** Something under a storyboard root changed (or the config did); clients rescan the whole catalogue. */
export interface StoryboardsChangedPayload {
  reason: 'external' | 'config';
}

export interface ConnectionStatusPayload {
  connected: boolean;
}

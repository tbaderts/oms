export type EventType =
  | 'file:changed'
  | 'file:created'
  | 'file:deleted'
  | 'config:changed'
  | 'kb:updated'
  | 'git:changed'
  | 'specs:tickets-changed'
  | 'connection:status';

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

export interface ConnectionStatusPayload {
  connected: boolean;
}

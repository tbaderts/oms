export type EventType =
  | 'file:changed'
  | 'file:created'
  | 'file:deleted'
  | 'config:changed'
  | 'kb:updated'
  | 'git:changed'
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

export interface ConnectionStatusPayload {
  connected: boolean;
}

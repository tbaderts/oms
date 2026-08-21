// BlotterStateService.ts - Persist user preferences per domain object type
import { DomainObjectType, BlotterStateSnapshot } from '../types/types';

const STORAGE_PREFIX = 'oms.blotter.state.';

function readStoredState(domainObject: DomainObjectType): BlotterStateSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + domainObject);
    return raw ? (JSON.parse(raw) as BlotterStateSnapshot) : null;
  } catch {
    return null;
  }
}

function writeStoredState(domainObject: DomainObjectType, state: BlotterStateSnapshot): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + domainObject, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — in-memory state still works for this session
  }
}

function removeStoredState(domainObject: DomainObjectType): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + domainObject);
  } catch {
    // Ignore
  }
}

export class BlotterStateService {
  private static instance: BlotterStateService;
  private stateMap: Map<DomainObjectType, BlotterStateSnapshot> = new Map();
  private listeners: Map<DomainObjectType, Array<(state: BlotterStateSnapshot) => void>> = new Map();

  private constructor() {}

  public static getInstance(): BlotterStateService {
    if (!BlotterStateService.instance) {
      BlotterStateService.instance = new BlotterStateService();
    }
    return BlotterStateService.instance;
  }

  public saveState(domainObject: DomainObjectType, state: BlotterStateSnapshot): void {
    this.stateMap.set(domainObject, state);
    writeStoredState(domainObject, state);
    this.notifyListeners(domainObject, state);
  }

  public getState(domainObject: DomainObjectType): BlotterStateSnapshot | null {
    const inMemory = this.stateMap.get(domainObject);
    if (inMemory) {
      return inMemory;
    }
    // Hydrate from localStorage on first access (e.g. after a page refresh)
    const stored = readStoredState(domainObject);
    if (stored) {
      this.stateMap.set(domainObject, stored);
    }
    return stored;
  }

  public clearState(domainObject: DomainObjectType): void {
    this.stateMap.delete(domainObject);
    removeStoredState(domainObject);
  }

  public clearAllStates(): void {
    this.stateMap.clear();
    (Object.keys(localStorage) as string[])
      .filter(key => key.startsWith(STORAGE_PREFIX))
      .forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore
        }
      });
  }

  public addStateChangeListener(
    domainObject: DomainObjectType,
    listener: (state: BlotterStateSnapshot) => void
  ): void {
    if (!this.listeners.has(domainObject)) {
      this.listeners.set(domainObject, []);
    }
    this.listeners.get(domainObject)!.push(listener);
  }

  public removeStateChangeListener(
    domainObject: DomainObjectType,
    listener: (state: BlotterStateSnapshot) => void
  ): void {
    const listeners = this.listeners.get(domainObject);
    if (listeners) {
      this.listeners.set(
        domainObject,
        listeners.filter(l => l !== listener)
      );
    }
  }

  private notifyListeners(domainObject: DomainObjectType, state: BlotterStateSnapshot): void {
    const listeners = this.listeners.get(domainObject);
    if (listeners) {
      listeners.forEach(listener => listener(state));
    }
  }
}

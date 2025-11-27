// BlotterStateService.ts - Persist user preferences per domain object type
import { DomainObjectType, BlotterStateSnapshot } from '../types/types';

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
    this.notifyListeners(domainObject, state);
  }

  public getState(domainObject: DomainObjectType): BlotterStateSnapshot | null {
    return this.stateMap.get(domainObject) || null;
  }

  public clearState(domainObject: DomainObjectType): void {
    this.stateMap.delete(domainObject);
  }

  public clearAllStates(): void {
    this.stateMap.clear();
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

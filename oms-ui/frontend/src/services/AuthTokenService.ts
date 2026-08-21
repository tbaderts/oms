// AuthTokenService.ts - OAuth token management singleton backed by sessionStorage
const TOKEN_STORAGE_KEY = 'oms.auth.token';

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable (e.g. disabled cookies) — fall back to memory
    return null;
  }
}

export class AuthTokenService {
  private static instance: AuthTokenService;
  private token: string | null = readStoredToken();
  private listeners: Array<(token: string | null) => void> = [];

  private constructor() {}

  public static getInstance(): AuthTokenService {
    if (!AuthTokenService.instance) {
      AuthTokenService.instance = new AuthTokenService();
    }
    return AuthTokenService.instance;
  }

  public setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures — in-memory token still works for this session
    }
    this.notifyListeners();
  }

  public getToken(): string | null {
    return this.token;
  }

  public hasToken(): boolean {
    return this.token !== null && this.token.length > 0;
  }

  public clearToken(): void {
    this.setToken(null);
  }

  public addTokenChangeListener(listener: (token: string | null) => void): void {
    this.listeners.push(listener);
  }

  public removeTokenChangeListener(listener: (token: string | null) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.token));
  }
}

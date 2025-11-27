// AuthTokenService.ts - OAuth token management singleton
export class AuthTokenService {
  private static instance: AuthTokenService;
  private token: string | null = null;
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
    this.notifyListeners();
  }

  public getToken(): string | null {
    return this.token;
  }

  public hasToken(): boolean {
    return this.token !== null && this.token.length > 0;
  }

  public clearToken(): void {
    this.token = null;
    this.notifyListeners();
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

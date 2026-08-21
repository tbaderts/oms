// AuthTokenService.test.ts - Tests for sessionStorage-backed token management
import { AuthTokenService } from './AuthTokenService';

describe('AuthTokenService', () => {
  let service: AuthTokenService;

  beforeEach(() => {
    sessionStorage.clear();
    // Reset singleton between tests
    (AuthTokenService as any).instance = null;
    service = AuthTokenService.getInstance();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('starts without a token', () => {
    expect(service.hasToken()).toBe(false);
    expect(service.getToken()).toBeNull();
  });

  it('stores and retrieves a token', () => {
    service.setToken('test-token-123');

    expect(service.hasToken()).toBe(true);
    expect(service.getToken()).toBe('test-token-123');
  });

  it('persists the token to sessionStorage', () => {
    service.setToken('persisted-token');

    expect(sessionStorage.getItem('oms.auth.token')).toBe('persisted-token');
  });

  it('restores the token from sessionStorage on a fresh instance', () => {
    sessionStorage.setItem('oms.auth.token', 'restored-token');
    (AuthTokenService as any).instance = null;

    const fresh = AuthTokenService.getInstance();

    expect(fresh.getToken()).toBe('restored-token');
    expect(fresh.hasToken()).toBe(true);
  });

  it('clears the token from memory and storage', () => {
    service.setToken('to-be-cleared');
    service.clearToken();

    expect(service.hasToken()).toBe(false);
    expect(service.getToken()).toBeNull();
    expect(sessionStorage.getItem('oms.auth.token')).toBeNull();
  });

  it('notifies listeners on token changes', () => {
    const listener = jest.fn();
    service.addTokenChangeListener(listener);

    service.setToken('notify-token');
    expect(listener).toHaveBeenCalledWith('notify-token');

    service.clearToken();
    expect(listener).toHaveBeenCalledWith(null);

    service.removeTokenChangeListener(listener);
    service.setToken('silent-token');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

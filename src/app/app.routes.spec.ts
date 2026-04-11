import { routes } from './app.routes';
import { authGuard } from './core/guards/auth.guard';
import { rolesChildGuard } from './core/guards/roles.guard';

describe('app route topology', () => {
  it('uses /app as the guarded shell entry route', () => {
    const appRoute = routes.find(route => route.path === 'app');

    expect(appRoute).toBeTruthy();
    expect(appRoute?.redirectTo).toBeUndefined();
    expect(typeof appRoute?.loadComponent).toBe('function');
    expect(appRoute?.canActivate).toEqual([authGuard]);
    expect(appRoute?.canActivateChild).toEqual([rolesChildGuard]);
    expect(Array.isArray(appRoute?.children)).toBe(true);
    expect(appRoute?.children?.some(child => child.path === '')).toBe(true);
  });

  it('keeps /chat as compatibility redirect to /app', () => {
    const chatRoute = routes.find(route => route.path === 'chat');

    expect(chatRoute).toBeTruthy();
    expect(chatRoute?.redirectTo).toBe('app');
  });
});


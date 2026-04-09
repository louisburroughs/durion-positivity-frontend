import { routes } from './app.routes';
import { authGuard } from './core/guards/auth.guard';
import { rolesChildGuard } from './core/guards/roles.guard';

describe('app route topology', () => {
  it('keeps /app as compatibility redirect to /chat', () => {
    const appRoute = routes.find(route => route.path === 'app');

    expect(appRoute).toBeTruthy();
    expect(appRoute?.redirectTo).toBe('chat');
  });

  it('uses /chat as the guarded shell entry route', () => {
    const chatRoute = routes.find(route => route.path === 'chat');

    expect(chatRoute).toBeTruthy();
    expect(chatRoute?.redirectTo).toBeUndefined();
    expect(typeof chatRoute?.loadComponent).toBe('function');
    expect(chatRoute?.canActivate).toEqual([authGuard]);
    expect(chatRoute?.canActivateChild).toEqual([rolesChildGuard]);
    expect(Array.isArray(chatRoute?.children)).toBe(true);
    expect(chatRoute?.children?.some(child => child.path === '')).toBe(true);
  });
});

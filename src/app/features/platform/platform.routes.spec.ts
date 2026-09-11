import { describe, expect, it } from 'vitest';
import { PLATFORM_ROUTES } from './platform.routes';
import { PLATFORM_PAGE } from '../../core/security/route-permissions';

describe('PLATFORM_ROUTES', () => {
  const rootRoute = PLATFORM_ROUTES.find(route => route.path === '');
  const children = rootRoute?.children ?? [];

  it('lands on the tenant list from the empty platform child path', () => {
    const defaultChild = children.find(child => child.path === '');

    expect(defaultChild?.pathMatch).toBe('full');
    expect(defaultChild?.redirectTo).toBe('tenants');
  });

  it('redirects unknown platform child paths back to the tenant list', () => {
    const wildcardChild = children.find(child => child.path === '**');

    expect(wildcardChild?.redirectTo).toBe('tenants');
  });

  it('gates the list and detail on platform:tenant:read and create on platform:tenant:create', () => {
    const byPath = new Map(children.map(child => [child.path, child]));

    expect(byPath.get('tenants')?.data?.['permissions']).toEqual(PLATFORM_PAGE.tenantRead);
    expect(byPath.get('tenants/:id')?.data?.['permissions']).toEqual(PLATFORM_PAGE.tenantRead);
    expect(byPath.get('tenants/new')?.data?.['permissions']).toEqual(PLATFORM_PAGE.tenantCreate);
    expect(typeof byPath.get('tenants')?.loadComponent).toBe('function');
    expect(typeof byPath.get('tenants/:id')?.loadComponent).toBe('function');
    expect(typeof byPath.get('tenants/new')?.loadComponent).toBe('function');
  });

  it('declares tenants/new before tenants/:id so "new" is never read as an id', () => {
    const paths = children.map(child => child.path);

    expect(paths.indexOf('tenants/new')).toBeLessThan(paths.indexOf('tenants/:id'));
  });
});

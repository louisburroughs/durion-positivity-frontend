import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_ROUTES, platformLanding } from './platform.routes';
import { PLATFORM_PAGE } from '../../core/security/route-permissions';
import { AuthService } from '../../core/services/auth.service';

describe('PLATFORM_ROUTES', () => {
  const rootRoute = PLATFORM_ROUTES.find(route => route.path === '');
  const children = rootRoute?.children ?? [];

  it('lands the empty platform child path on the first page the session can open', () => {
    const defaultChild = children.find(child => child.path === '');

    expect(defaultChild?.pathMatch).toBe('full');
    expect(defaultChild?.redirectTo).toBe(platformLanding);
  });

  describe('platformLanding', () => {
    let session: { roles: string[]; permissions: string[] | null };
    const authStub = {
      permissionsKnown: () => session.permissions !== null,
      hasAnyRole: (roles: readonly string[]) => roles.some(role => session.roles.includes(role)),
      hasAnyPermission: (codes: readonly string[]) =>
        session.permissions !== null && codes.some(code => session.permissions!.includes(code)),
      hasPermission: (code: string) => session.permissions !== null && session.permissions.includes(code),
    };

    beforeEach(() => {
      session = { roles: [], permissions: [] };
      TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: authStub }] });
    });

    const landing = (): string => TestBed.runInInjectionContext(platformLanding);

    it('sends a read-only session to the list', () => {
      session.permissions = ['platform:tenant:read'];
      expect(landing()).toBe('tenants');
    });

    it('sends a create-only session to the create form', () => {
      session.permissions = ['platform:tenant:create'];
      expect(landing()).toBe('tenants/new');
    });

    it('sends a session holding both to the list', () => {
      session.permissions = ['platform:tenant:read', 'platform:tenant:create'];
      expect(landing()).toBe('tenants');
    });

    it('falls back to the role for a token without perm_bits', () => {
      session.permissions = null;
      session.roles = ['ROLE_PLATFORM_ADMIN'];
      expect(landing()).toBe('tenants');
    });
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

import { PEOPLE_ROUTES } from './people.routes';

describe('PEOPLE_ROUTES', () => {
  const rootRoute = PEOPLE_ROUTES.find(route => route.path === '');

  it('uses a landing page for the empty people child path', () => {
    const defaultChild = rootRoute?.children?.find(child => child.path === '');

    expect(typeof defaultChild?.loadComponent).toBe('function');
  });

  it('redirects unknown people child paths back to the landing page', () => {
    const wildcardChild = rootRoute?.children?.find(child => child.path === '**');

    expect(wildcardChild?.redirectTo).toBe('');
  });

  it('keeps every landing page destination route available', () => {
    const childPaths = rootRoute?.children?.map(child => child.path) ?? [];

    expect(childPaths).toContain('rbac/:personUuid');
    expect(childPaths).toContain('timekeeping/approval');
    expect(childPaths).toContain('timekeeping/work-session/:sessionId/submit');
    expect(childPaths).toContain('timekeeping/work-session');
    expect(childPaths).toContain('timekeeping/export');
    expect(childPaths).toContain('timekeeping/discrepancy');
    expect(childPaths).toContain('employees');
    expect(childPaths).toContain('employees/new');
    expect(childPaths).toContain('employees/:id');
    expect(childPaths).toContain('employees/:id/offboard');
    expect(childPaths).toContain('person/:personId/locations');
    expect(childPaths).toContain('identity-compliance');
  });

  it('gates the employee register on the permission its page checks', () => {
    // The page's own gates are useless if the route is unreachable or ungated, and no
    // component test can see either — this is the only place both are asserted (ADR-0040 §6a).
    const registerRoute = rootRoute?.children?.find(child => child.path === 'employees');

    expect(typeof registerRoute?.loadComponent).toBe('function');
    expect(registerRoute?.data?.['permissions']).toEqual(['people:employee:view']);
  });

  it('gates the identity-compliance report on the permission the backend enforces', () => {
    // Was ROLE_ADMIN as a stand-in while the guard had no permission model; #235
    // gave it one, so the gate is now the authority the controller names (#236).
    const complianceRoute = rootRoute?.children?.find(
      child => child.path === 'identity-compliance',
    );

    expect(complianceRoute?.data?.['permissions']).toEqual(['people:compliance:view']);
  });

  it('gates the person profile on the identity-directory read the directory links from', () => {
    const personRoute = rootRoute?.children?.find(child => child.path === 'person/:personId');

    expect(typeof personRoute?.loadComponent).toBe('function');
    expect(personRoute?.data?.['permissions']).toEqual(['people-contact:person:view']);
  });
});

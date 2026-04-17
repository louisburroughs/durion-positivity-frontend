import { LOCATION_ROUTES } from './location.routes';

describe('LOCATION_ROUTES', () => {
  const rootRoute = LOCATION_ROUTES.find(route => route.path === '');

  it('uses a landing page for the empty location child path', () => {
    const rootRoute = LOCATION_ROUTES.find(route => route.path === '');
    const defaultChild = rootRoute?.children?.find(child => child.path === '');

    expect(typeof defaultChild?.loadComponent).toBe('function');
    expect(defaultChild?.pathMatch).toBe('full');
  });

  it('redirects unknown location child paths back to the landing page', () => {
    const wildcardChild = rootRoute?.children?.find(child => child.path === '**');

    expect(wildcardChild?.redirectTo).toBe('');
  });

  it('keeps a concrete locations child route', () => {
    const locationsChild = rootRoute?.children?.find(child => child.path === 'locations');

    expect(typeof locationsChild?.loadComponent).toBe('function');
  });
});

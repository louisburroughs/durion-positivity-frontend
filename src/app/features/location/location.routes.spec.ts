import { LOCATION_ROUTES } from './location.routes';

describe('LOCATION_ROUTES', () => {
  it('redirects the empty location path to locations', () => {
    const rootRoute = LOCATION_ROUTES.find(route => route.path === '');
    const defaultChild = rootRoute?.children?.find(child => child.path === '');

    expect(defaultChild?.redirectTo).toBe('locations');
    expect(defaultChild?.pathMatch).toBe('full');
  });

  it('keeps a concrete locations child route', () => {
    const rootRoute = LOCATION_ROUTES.find(route => route.path === '');
    const locationsChild = rootRoute?.children?.find(child => child.path === 'locations');

    expect(typeof locationsChild?.loadComponent).toBe('function');
  });
});

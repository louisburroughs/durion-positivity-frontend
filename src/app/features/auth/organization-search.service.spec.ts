import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthAPIService } from '@durion-sdk/security';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIN_QUERY_LENGTH, OrganizationSearchService } from './organization-search.service';

describe('OrganizationSearchService', () => {
  const authApi = { searchTenants: vi.fn() };
  let service: OrganizationSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [OrganizationSearchService, { provide: AuthAPIService, useValue: authApi }],
    });
    service = TestBed.inject(OrganizationSearchService);
  });

  function search(query: string) {
    let result: unknown;
    service.search(query).subscribe(r => (result = r));
    return result;
  }

  describe('below the minimum query length', () => {
    it('answers empty without calling the API', () => {
      expect(MIN_QUERY_LENGTH).toBe(3);

      expect(search('ac')).toEqual([]);
      expect(search('')).toEqual([]);
      expect(search('   ')).toEqual([]);

      expect(authApi.searchTenants).not.toHaveBeenCalled();
    });

    it('counts the trimmed length, so padding does not buy a query', () => {
      expect(search('  a  ')).toEqual([]);
      expect(authApi.searchTenants).not.toHaveBeenCalled();
    });
  });

  it('sends the trimmed query once it is long enough', () => {
    authApi.searchTenants.mockReturnValue(of([]));

    search('  acme ');

    expect(authApi.searchTenants).toHaveBeenCalledWith('acme');
  });

  it('maps results to name and slug only', () => {
    authApi.searchTenants.mockReturnValue(
      of([{ slug: 'acme-tire', displayName: 'Acme Tire & Auto', tenantId: 'leaked', status: 'ACTIVE' }]),
    );

    expect(search('acme')).toEqual([{ slug: 'acme-tire', displayName: 'Acme Tire & Auto' }]);
  });

  it('drops malformed rows rather than offering an unpickable option', () => {
    authApi.searchTenants.mockReturnValue(
      of([{ slug: 'ok', displayName: 'Fine' }, { slug: '', displayName: 'No slug' }, { slug: 'x' }, null]),
    );

    expect(search('acme')).toEqual([{ slug: 'ok', displayName: 'Fine' }]);
  });

  it('treats a null body as no matches', () => {
    authApi.searchTenants.mockReturnValue(of(null));

    expect(search('acme')).toEqual([]);
  });

  describe('failures', () => {
    it('reports 404 as "directory unavailable", so the form can fall back to the slug', () => {
      authApi.searchTenants.mockReturnValue(throwError(() => ({ status: 404 })));

      expect(search('acme')).toBeNull();
    });

    it('reports every other failure as no matches, never as a distinct message', () => {
      // A different answer for "no such organization" than for "the server said no"
      // would confirm to an anonymous caller whether an organization exists.
      for (const status of [0, 400, 429, 500, 503]) {
        authApi.searchTenants.mockReturnValue(throwError(() => ({ status })));
        expect(search('acme')).toEqual([]);
      }
    });

    it('treats an error with no status as no matches', () => {
      authApi.searchTenants.mockReturnValue(throwError(() => new Error('network')));

      expect(search('acme')).toEqual([]);
    });
  });
});

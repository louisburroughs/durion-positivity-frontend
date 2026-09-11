import { describe, expect, it } from 'vitest';
import { PLATFORM_TENANT_ID, isTenantSlug, normalizeTenantSlug, tenantSlugFromHost } from './tenant';

describe('tenantSlugFromHost', () => {
  const suffix = '.positivity.example';

  it('names the tenant when the host is <slug><suffix>', () => {
    expect(tenantSlugFromHost('acme-tire.positivity.example', suffix)).toBe('acme-tire');
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(tenantSlugFromHost(' Acme-Tire.Positivity.Example ', suffix)).toBe('acme-tire');
  });

  it('names nothing for a host without the suffix (localhost, preview hosts)', () => {
    expect(tenantSlugFromHost('localhost', suffix)).toBeNull();
    expect(tenantSlugFromHost('preview.durion.dev', suffix)).toBeNull();
  });

  it('names nothing when the suffix is empty — form mode', () => {
    expect(tenantSlugFromHost('acme-tire.positivity.example', '')).toBeNull();
  });

  it('stays in form mode when the host prefix is not a well-formed slug', () => {
    expect(tenantSlugFromHost('a_b.positivity.example', suffix)).toBeNull();
    expect(tenantSlugFromHost('ab.positivity.example', suffix)).toBeNull();
    expect(tenantSlugFromHost('-acme.positivity.example', suffix)).toBeNull();
  });

  it('names nothing for the bare suffix host or a deeper subdomain', () => {
    expect(tenantSlugFromHost('positivity.example', suffix)).toBeNull();
    expect(tenantSlugFromHost('www.acme-tire.positivity.example', suffix)).toBeNull();
  });

  it('pins the platform tenant id every module agrees on', () => {
    expect(PLATFORM_TENANT_ID).toBe('01900000-0000-7000-8000-000000000000');
  });
});

describe('tenant slug helpers', () => {
  it('normalizes a typed slug the way it is sent', () => {
    expect(normalizeTenantSlug('  Acme-Tire ')).toBe('acme-tire');
  });

  it('applies the registry rule: lowercase, digits, hyphens, 3 to 63 characters', () => {
    expect(isTenantSlug('acme-tire')).toBe(true);
    expect(isTenantSlug('ab')).toBe(false);
    expect(isTenantSlug('Acme')).toBe(false);
    expect(isTenantSlug('-acme')).toBe(false);
  });
});

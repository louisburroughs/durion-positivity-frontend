import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { SitemapPageComponent } from './sitemap-page.component';

class AuthServiceStub {
  roles: string[] = [];
  /** null models a token with no perm_bits claim — permissions unknown. */
  permissions: string[] | null = null;

  hasAnyRole(required: readonly string[]): boolean {
    return required.some(role => this.roles.includes(role));
  }
  permissionsKnown(): boolean {
    return this.permissions !== null;
  }
  hasPermission(permission: string): boolean {
    return this.permissions !== null && this.permissions.includes(permission);
  }
  hasAnyPermission(required: readonly string[]): boolean {
    return this.permissions !== null && required.some(code => this.permissions!.includes(code));
  }
}

describe('SitemapPageComponent', () => {
  let fixture: ComponentFixture<SitemapPageComponent>;
  let component: SitemapPageComponent;
  let auth: AuthServiceStub;

  async function setup(roles: string[], permissions: string[] | null = null): Promise<void> {
    TestBed.resetTestingModule();
    auth = new AuthServiceStub();
    auth.roles = roles;
    auth.permissions = permissions;

    await TestBed.configureTestingModule({
      imports: [SitemapPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(SitemapPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('creates the component', async () => {
    await setup([]);
    expect(component).toBeTruthy();
  });

  it('shows only the main group for a non-admin user', async () => {
    await setup([]);
    const groups = component.groups();
    expect(groups.map(g => g.headingKey)).toEqual(['SITEMAP.GROUP.MAIN']);
    expect(groups[0].sections.length).toBe(10);
    expect(component.state()).toBe('ready');
  });

  it('shows both groups including admin-only sections for an admin', async () => {
    await setup(['ROLE_ADMIN']);
    const groups = component.groups();
    expect(groups.map(g => g.headingKey)).toEqual([
      'SITEMAP.GROUP.MAIN',
      'SITEMAP.GROUP.ADMIN',
    ]);
    const admin = groups.find(g => g.headingKey === 'SITEMAP.GROUP.ADMIN');
    expect(admin?.sections.map(s => s.section.route)).toEqual([
      '/app/security',
      '/app/admin',
    ]);
  });

  it('sorts sections within a group by order', async () => {
    await setup([]);
    const main = component.groups()[0].sections.map(s => s.section.order);
    expect(main).toEqual([...main].sort((a, b) => a - b));
  });

  it('lists static child pages under a section but omits dynamic :param routes', async () => {
    await setup([]);
    const crm = component
      .groups()[0]
      .sections.find(s => s.section.route === '/app/crm');
    const routes = crm?.pages.map(p => p.route) ?? [];

    expect(routes).toContain('/app/crm/customers');
    expect(routes.every(r => !r.includes(':'))).toBe(true); // no dynamic routes
    expect(crm?.pages.every(p => p.dynamic === false)).toBe(true);
  });

  /**
   * #236 moved the per-page gate from roles to the permission the backend
   * enforces, so the sitemap filters on `canAccess` like the guard and the nav.
   */
  function peoplePages(): string[] {
    return (
      component
        .groups()
        .flatMap(g => g.sections)
        .find(s => s.section.route === '/app/people')
        ?.pages.map(p => p.route) ?? []
    );
  }

  it('lists every page for a token with no perm_bits claim', async () => {
    // Legacy tokens fall back to roles, so permission gates must not hide pages.
    await setup(['ROLE_ADMIN'], null);
    expect(peoplePages()).toContain('/app/people/identity-compliance');
    expect(peoplePages()).toContain('/app/people/directory');
  });

  it('hides a permission-gated child page from a session lacking the code', async () => {
    await setup(['ROLE_ADMIN'], ['people-contact:person:view']);
    expect(peoplePages()).toContain('/app/people/directory');
    expect(peoplePages()).not.toContain('/app/people/identity-compliance');
  });

  it('shows a permission-gated child page to a session holding the code', async () => {
    await setup(['ROLE_ADMIN'], ['people:compliance:view']);
    expect(peoplePages()).toContain('/app/people/identity-compliance');
    expect(peoplePages()).not.toContain('/app/people/directory');
  });

  it('renders section links and child-page links in the DOM', async () => {
    await setup(['ROLE_ADMIN']);
    const sectionLinks = fixture.nativeElement.querySelectorAll('.sitemap__link');
    const pageLinks = fixture.nativeElement.querySelectorAll('.sitemap__page-link');
    expect(sectionLinks.length).toBe(12);
    expect(pageLinks.length).toBeGreaterThan(20);
  });
});

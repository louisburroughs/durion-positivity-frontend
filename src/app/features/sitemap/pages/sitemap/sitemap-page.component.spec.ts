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

  it('shows only the main group, reduced to the open dashboard, for a non-admin user with known, zero permissions', async () => {
    // Known (non-null), empty permissions — a genuinely unprivileged session, as
    // opposed to a legacy token with no perm_bits claim at all (see the next
    // test): with permissions known, a permission-gated page/section is denied
    // outright rather than falling back to "open".
    //
    // PR #367 followup: every other main-group mount (people, product, ...) is
    // permission-gated in app.routes.ts, and a non-standalone child page that
    // declares no permission of its own (e.g. /app/people/timekeeping/work-session)
    // still inherits that mount's guard at runtime (rolesChildGuard runs against
    // the mount node itself on the way down) — it must not admit the section on
    // its own, so only the ungated dashboard root remains.
    await setup([], []);
    const groups = component.groups();
    expect(groups.map(g => g.headingKey)).toEqual(['SITEMAP.GROUP.MAIN']);
    expect(groups[0].sections.map(s => s.section.route)).toEqual(['/app']);
    expect(component.state()).toBe('ready');
  });

  it('shows the main group plus an admin-only section reduced to its one open child page for a legacy token', async () => {
    // roles=[], permissions=null: no perm_bits claim at all. `canAccess` falls
    // back to roles for anything permission-gated, and inventory-permissions
    // declares no roles — so it's "open" to a legacy token, same as the route
    // guard would allow if navigated to directly. That surfaces the otherwise
    // ROLE_ADMIN-gated `security` section, but with only that one child page.
    await setup([]);
    const groups = component.groups();
    expect(groups.map(g => g.headingKey)).toEqual(['SITEMAP.GROUP.MAIN', 'SITEMAP.GROUP.ADMIN']);
    expect(groups[0].sections.length).toBe(10);

    const admin = groups.find(g => g.headingKey === 'SITEMAP.GROUP.ADMIN');
    expect(admin?.sections.map(s => s.section.route)).toEqual(['/app/security']);
    expect(admin?.sections[0].pages.map(p => p.route)).toEqual(['/app/security/inventory-permissions']);
    expect(component.state()).toBe('ready');
  });

  /**
   * #366 followup: `/app/security/inventory-permissions` is a sibling route,
   * permission-gated on its own (`security:permission:view`), registered next
   * to the ROLE_ADMIN-gated `/app/security` mount rather than nested under it.
   * A section used to be admitted only by its own (mount) requirement, so a
   * permitted non-admin never saw this page in the sitemap even though the
   * route guard would let them open it directly.
   */
  it('lists a permission-gated child page under an admin-only section for a permitted non-admin', async () => {
    await setup([], ['security:permission:view']);
    const security = component
      .groups()
      .flatMap(g => g.sections)
      .find(s => s.section.route === '/app/security');

    expect(security).toBeTruthy();
    const pageRoutes = security?.pages.map(p => p.route) ?? [];
    expect(pageRoutes).toContain('/app/security/inventory-permissions');

    // Sibling security pages gated on a permission this session doesn't hold stay hidden.
    expect(pageRoutes).not.toContain('/app/security/audit-logs');
    expect(pageRoutes).not.toContain('/app/security/users/provision');
  });

  it('still hides the whole security section from a non-admin with no relevant permission', async () => {
    await setup([], ['people-contact:person:view']);
    const routes = component.groups().flatMap(g => g.sections.map(v => v.section.route));
    expect(routes).not.toContain('/app/security');
  });

  /**
   * PR #367 followup: the previous "admit via any accessible child page" rule
   * didn't distinguish `/app/security/inventory-permissions` (a standalone
   * sibling route — its own permission gate is the whole gate) from
   * `/app/security/audit-logs` (nested inside the ROLE_ADMIN-gated
   * `/app/security` mount, which `rolesChildGuard` still enforces even though
   * the page also declares `security:audit:view`). A non-admin holding only the
   * nested page's permission must not see the section — they cannot reach it,
   * since the mount's own guard still refuses them.
   */
  it('does not admit a section via a non-standalone child page permission alone', async () => {
    await setup([], ['security:audit:view']);
    const routes = component.groups().flatMap(g => g.sections.map(v => v.section.route));
    expect(routes).not.toContain('/app/security');
  });

  it('offers the platform section to a permission-only platform operator (ADR-0062)', async () => {
    // A platform operator's token carries platform:* bits; the role is only the
    // fallback for tokens without perm_bits, so the section must not need it.
    await setup([], ['platform:tenant:read']);
    const routes = component.groups().flatMap(g => g.sections.map(v => v.section.route));
    expect(routes).toContain('/app/platform');

    await setup(['ROLE_ADMIN'], ['security:role:view']);
    const adminRoutes = component.groups().flatMap(g => g.sections.map(v => v.section.route));
    expect(adminRoutes).not.toContain('/app/platform');
  });

  it('hides a domain section from a session without that domain\'s permissions (mount gate)', async () => {
    // The route tree gates /app/crm on crm:* etc.; the curated data declares no
    // permissions for those sections, so the guard's own gate must decide here.
    await setup([], ['people-contact:person:view']);
    const routes = component.groups().flatMap(g => g.sections.map(v => v.section.route));
    expect(routes).toContain('/app');
    expect(routes).toContain('/app/people');
    expect(routes).not.toContain('/app/crm');
    expect(routes).not.toContain('/app/billing');
    expect(routes).not.toContain('/app/accounting');
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

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { SitemapPageComponent } from './sitemap-page.component';

class AuthServiceStub {
  roles: string[] = [];
  hasAnyRole(required: readonly string[]): boolean {
    return required.some(role => this.roles.includes(role));
  }
}

describe('SitemapPageComponent', () => {
  let fixture: ComponentFixture<SitemapPageComponent>;
  let component: SitemapPageComponent;
  let auth: AuthServiceStub;

  async function setup(roles: string[]): Promise<void> {
    TestBed.resetTestingModule();
    auth = new AuthServiceStub();
    auth.roles = roles;

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

  it('hides admin-gated child pages from non-admins but shows them to admins', async () => {
    await setup([]);
    const peopleNonAdmin = component
      .groups()[0]
      .sections.find(s => s.section.route === '/app/people');
    expect(peopleNonAdmin?.pages.map(p => p.route)).not.toContain(
      '/app/people/identity-compliance',
    );

    await setup(['ROLE_ADMIN']);
    const peopleAdmin = component
      .groups()
      .flatMap(g => g.sections)
      .find(s => s.section.route === '/app/people');
    expect(peopleAdmin?.pages.map(p => p.route)).toContain(
      '/app/people/identity-compliance',
    );
  });

  it('renders section links and child-page links in the DOM', async () => {
    await setup(['ROLE_ADMIN']);
    const sectionLinks = fixture.nativeElement.querySelectorAll('.sitemap__link');
    const pageLinks = fixture.nativeElement.querySelectorAll('.sitemap__page-link');
    expect(sectionLinks.length).toBe(12);
    expect(pageLinks.length).toBeGreaterThan(20);
  });
});

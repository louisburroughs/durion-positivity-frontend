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
    expect(admin?.sections.map(s => s.route)).toEqual([
      '/app/security',
      '/app/admin',
    ]);
  });

  it('sorts sections within a group by order', async () => {
    await setup([]);
    const main = component.groups()[0].sections;
    const orders = main.map(s => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('renders a routerLink and description for every visible section', async () => {
    await setup(['ROLE_ADMIN']);
    const links = fixture.nativeElement.querySelectorAll('.sitemap__link');
    const descs = fixture.nativeElement.querySelectorAll('.sitemap__desc');
    expect(links.length).toBe(12);
    expect(descs.length).toBe(12);
  });
});

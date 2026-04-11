import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NavComponent } from './nav.component';
import { NavigationRegistryService } from '../../services/navigation-registry.service';
import type { NavItem } from '../../models/nav-item.model';

const testItems: NavItem[] = [
  { key: 'SHELL.NAV.DASHBOARD', icon: 'D', route: '/app', exact: true, order: 1, group: 'main' },
  { key: 'SHELL.NAV.WORKORDERS', icon: 'W', route: '/app/workexec', order: 2, group: 'main' },
  { key: 'SHELL.NAV.CRM', icon: 'C', route: '/app/crm', order: 3, group: 'main' },
];

describe('NavComponent', () => {
  let fixture: ComponentFixture<NavComponent>;
  let component: NavComponent;

  const navRegistryServiceStub: Pick<NavigationRegistryService, 'visibleNavItems'> = {
    visibleNavItems: signal(testItems),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: NavigationRegistryService, useValue: navRegistryServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders one nav link per visible item', () => {
    const links = fixture.debugElement.queryAll(By.css('a.nav-item'));

    expect(links).toHaveLength(testItems.length);
  });

  it('displays a nav-label span for each item when not collapsed', () => {
    // default collapsed input is false — nav-label spans must be present
    const labels = fixture.debugElement.queryAll(By.css('.nav-label'));

    expect(labels).toHaveLength(testItems.length);
    expect(labels[0].nativeElement.textContent.trim()).toBe(testItems[0].key);
  });

  it('hides nav-label spans when collapsed input is true', () => {
    fixture.componentRef.setInput('collapsed', true);
    fixture.detectChanges();

    const labels = fixture.debugElement.queryAll(By.css('.nav-label'));

    expect(labels).toHaveLength(0);
  });

  it('sets the id attribute on the nav element to the default shell-nav', () => {
    const nav = fixture.debugElement.query(By.css('nav'));

    expect(nav.nativeElement.id).toBe('shell-nav');
  });

  it('sets the id attribute on the nav element from the navId input', () => {
    fixture.componentRef.setInput('navId', 'sidebar-nav');
    fixture.detectChanges();

    const nav = fixture.debugElement.query(By.css('nav'));

    expect(nav.nativeElement.id).toBe('sidebar-nav');
  });
});

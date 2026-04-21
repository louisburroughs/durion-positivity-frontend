import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminLandingPageComponent } from './admin-landing-page.component';

describe('AdminLandingPageComponent', () => {
  let fixture: ComponentFixture<AdminLandingPageComponent>;
  let component: AdminLandingPageComponent;
  let router: Router;

  const findLaunchCard = (field: string) => {
    const card = component.sections.flatMap(s => s.cards).find(c =>
      component.isLaunchCard(c) && c.field === field,
    );
    if (!card || !component.isLaunchCard(card)) {
      throw new Error(`Launch card for field '${field}' not found`);
    }
    return card;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AdminLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('initialises in ready state with no error key', () => {
    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
  });

  it('exposes the correct page counts', () => {
    expect(component.directLinkCount).toBe(6);
    expect(component.guidedLinkCount).toBe(1);
    expect(component.totalPageCount).toBe(7);
  });

  it('renders four sections', () => {
    expect(component.sections.length).toBe(4);
  });

  it('renders all direct link anchors', () => {
    const links = fixture.debugElement.queryAll(
      By.css('a.admin-button--primary, a.admin-button--secondary'),
    );
    // Hero has 2 + directLinkCount cards
    expect(links.length).toBe(2 + component.directLinkCount);
  });

  it('classifies launch cards correctly with isLaunchCard', () => {
    const allCards = component.sections.flatMap(s => s.cards);
    const launchCards = allCards.filter(c => component.isLaunchCard(c));
    const directCards = allCards.filter(c => !component.isLaunchCard(c));
    expect(launchCards.length).toBe(1);
    expect(directCards.length).toBe(6);
  });

  it('updateLaunchValue updates the roleName signal', () => {
    component.updateLaunchValue('roleName', 'ROLE_MANAGER');
    expect(component.launchValue('roleName')).toBe('ROLE_MANAGER');
  });

  it('updateLaunchValue clears any existing field error', () => {
    const launchButton = fixture.debugElement.query(By.css('[data-testid="roleName-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();
    expect(component.launchError('roleName')).not.toBeNull();

    component.updateLaunchValue('roleName', 'ROLE_MANAGER');
    fixture.detectChanges();
    expect(component.launchError('roleName')).toBeNull();
  });

  it('shows an inline validation error when roleName launch is submitted empty', () => {
    const launchButton = fixture.debugElement.query(By.css('[data-testid="roleName-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input[name="roleName"]')).nativeElement;
    const errorEl = fixture.debugElement.query(By.css('.admin-field__error'));

    expect(errorEl).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('roleName-error');
  });

  it('clears the field error when the user types a value', () => {
    const launchButton = fixture.debugElement.query(By.css('[data-testid="roleName-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    component.updateLaunchValue('roleName', 'ROLE_ADMIN');
    fixture.detectChanges();

    expect(component.launchError('roleName')).toBeNull();
    expect(fixture.debugElement.query(By.css('.admin-field__error'))).toBeNull();
  });

  it('navigates to the role detail page when roleName is provided', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('roleName', 'ROLE_ADMIN');
    fixture.detectChanges();

    const launchButton = fixture.debugElement.query(By.css('[data-testid="roleName-launch"]'));
    launchButton.nativeElement.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/app', 'security', 'roles', 'ROLE_ADMIN']);
  });

  it('sets state to error when navigation resolves false', async () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(false);

    component.updateLaunchValue('roleName', 'ROLE_ADMIN');
    await component.openLaunch(findLaunchCard('roleName'));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ADMIN.LANDING.ERROR.NAVIGATE');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('sets state to error when navigation rejects', async () => {
    vi.spyOn(router, 'navigate').mockRejectedValue(new Error('nav error'));

    component.updateLaunchValue('roleName', 'ROLE_ADMIN');
    await component.openLaunch(findLaunchCard('roleName'));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('ADMIN.LANDING.ERROR.NAVIGATE');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('clears activeLaunchField after successful navigation', async () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('roleName', 'ROLE_ADMIN');
    await component.openLaunch(findLaunchCard('roleName'));

    expect(component.activeLaunchField()).toBeNull();
    expect(component.state()).toBe('ready');
  });
});

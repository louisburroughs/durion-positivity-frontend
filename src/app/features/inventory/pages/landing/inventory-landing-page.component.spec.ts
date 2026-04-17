import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { InventoryLandingPageComponent } from './inventory-landing-page.component';

describe('InventoryLandingPageComponent', () => {
  let fixture: ComponentFixture<InventoryLandingPageComponent>;
  let component: InventoryLandingPageComponent;
  let router: Router;

  const findLaunchCard = (field: string) => {
    const card = component.sections.flatMap((section) => section.cards).find((candidate) => {
      return component.isLaunchCard(candidate) && candidate.field === field;
    });

    if (!card || !component.isLaunchCard(card)) {
      throw new Error(`Launch card for ${field} was not found`);
    }

    return card;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(InventoryLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders all direct inventory links on the landing page', () => {
    const directLinks = fixture.debugElement.queryAll(
      By.css('a.inventory-button--primary, a.inventory-button--secondary, a.inventory-card__link'),
    );

    // directLinkCount card links + 2 hero CTA anchors
    expect(directLinks.length).toBe(component.directLinkCount + 2);
  });

  it('shows inline validation when a guided launch is missing its identifier', () => {
    const launchButton = fixture.debugElement.query(By.css('[data-testid="putawayTaskId-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    const launchInput = fixture.debugElement.query(
      By.css('input[name="putawayTaskId"]'),
    ).nativeElement;
    const errorMessage = fixture.debugElement.query(By.css('.inventory-field__error'));

    expect(errorMessage).toBeTruthy();
    expect(launchInput.getAttribute('aria-invalid')).toBe('true');
    expect(launchInput.getAttribute('aria-describedby')).toBe('putawayTaskId-error');
  });

  it('clears the field error when the user updates the launch value', () => {
    // Trigger validation error first
    const launchButton = fixture.debugElement.query(By.css('[data-testid="putawayTaskId-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    expect(component.launchError('putawayTaskId')).not.toBeNull();

    component.updateLaunchValue('putawayTaskId', 'task-123');
    fixture.detectChanges();

    expect(component.launchError('putawayTaskId')).toBeNull();
    const errorMessage = fixture.debugElement.query(By.css('.inventory-field__error'));
    expect(errorMessage).toBeNull();
  });

  it('navigates to a contextual inventory page when a guided launch value is provided', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('putawayTaskId', 'task-123');
    fixture.detectChanges();

    const launchButton = fixture.debugElement.query(By.css('[data-testid="putawayTaskId-launch"]'));
    launchButton.nativeElement.click();

    expect(navigateSpy).toHaveBeenCalledWith([
      '/app',
      'inventory',
      'putaway',
      'tasks',
      'task-123',
    ]);
  });

  it('resets state to idle after a successful navigation', async () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('putawayTaskId', 'task-123');
    await component.openLaunch(findLaunchCard('putawayTaskId'));

    expect(component.state()).toBe('idle');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('moves to error state when navigation resolves false', async () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(false);

    component.updateLaunchValue('putawayTaskId', 'task-123');
    await component.openLaunch(findLaunchCard('putawayTaskId'));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.LANDING.ERROR.NAVIGATE');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('moves to error state when navigation rejects', async () => {
    vi.spyOn(router, 'navigate').mockRejectedValue(new Error('navigation failed'));

    component.updateLaunchValue('putawayTaskId', 'task-456');
    await component.openLaunch(findLaunchCard('putawayTaskId'));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.LANDING.ERROR.NAVIGATE');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('builds the expected router commands for the purchase order detail guided launch', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('poId', 'po-789');
    await component.openLaunch(findLaunchCard('poId'));

    expect(navigateSpy).toHaveBeenLastCalledWith(['/app', 'inventory', 'purchase-orders', 'po-789']);
  });

  it('builds the expected router commands for the workorder pick list guided launch', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('workorderPickListId', 'wo-001');
    await component.openLaunch(findLaunchCard('workorderPickListId'));

    expect(navigateSpy).toHaveBeenLastCalledWith([
      '/app',
      'inventory',
      'fulfillment',
      'workorders',
      'wo-001',
      'pick-list',
    ]);
  });
});

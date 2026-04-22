import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { LocationLandingPageComponent } from './location-landing-page.component';
import { BulkImportService } from '../../../bulk-import/services/bulk-import.service';

describe('LocationLandingPageComponent', () => {
  let fixture: ComponentFixture<LocationLandingPageComponent>;
  let component: LocationLandingPageComponent;
  let router: Router;
  const bulkImportService = {
    getActiveJobDomains: vi.fn(),
  };

  const findLaunchCard = (field: string) => {
    const card = component.sections.flatMap(section => section.cards).find(candidate => {
      return component.isLaunchCard(candidate) && candidate.field === field;
    });

    if (!card || !component.isLaunchCard(card)) {
      throw new Error(`Launch card for ${field} was not found`);
    }

    return card;
  };

  beforeEach(async () => {
    bulkImportService.getActiveJobDomains.mockReturnValue(of(new Set()));

    await TestBed.configureTestingModule({
      imports: [LocationLandingPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BulkImportService, useValue: bulkImportService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(LocationLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('fetches and renders the active import indicator for the location import card', () => {
    bulkImportService.getActiveJobDomains.mockReturnValue(of(new Set(['LOCATION'])));
    fixture = TestBed.createComponent(LocationLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const activeIndicators = fixture.debugElement.queryAll(By.css('.location-card__active-import'));

    expect(bulkImportService.getActiveJobDomains).toHaveBeenCalled();
    expect(activeIndicators).toHaveLength(1);
  });

  it('renders all direct location links on the landing page', () => {
    const directLinks = fixture.debugElement.queryAll(
      By.css('a.location-button--primary, a.location-button--secondary'),
    );

    expect(directLinks.length).toBe(component.directLinkCount + 2);
  });

  it('shows inline validation when a guided launch is missing its identifier', () => {
    const launchButton = fixture.debugElement.query(By.css('[data-testid="locationId-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    const launchInput = fixture.debugElement.query(By.css('input[name="locationId"]')).nativeElement;
    const errorMessage = fixture.debugElement.query(By.css('.location-field__error'));

    expect(errorMessage).toBeTruthy();
    expect(launchInput.getAttribute('aria-invalid')).toBe('true');
    expect(launchInput.getAttribute('aria-describedby')).toBe('locationId-error');
  });

  it('clears the field error when the user updates the launch value', () => {
    // Trigger a validation error first
    const launchButton = fixture.debugElement.query(By.css('[data-testid="locationId-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    // Verify error is set
    expect(component.launchError('locationId')).not.toBeNull();

    // Now update the value
    component.updateLaunchValue('locationId', 'loc-123');
    fixture.detectChanges();

    // Error should be cleared
    expect(component.launchError('locationId')).toBeNull();
    // And error display should be gone
    const errorMessage = fixture.debugElement.query(By.css('.location-field__error'));
    expect(errorMessage).toBeNull();
  });

  it('navigates to a contextual location page when a guided launch value is provided', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('locationId', 'loc-123');
    fixture.detectChanges();

    const launchButton = fixture.debugElement.query(By.css('[data-testid="locationId-launch"]'));
    launchButton.nativeElement.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/app', 'location', 'locations', 'loc-123']);
  });

  it('moves the launch back to error state when navigation resolves false', async () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(false);

    component.updateLaunchValue('locationId', 'loc-123');
    await component.openLaunch(findLaunchCard('locationId'));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('LOCATION.LANDING.ERROR.NAVIGATE');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('moves the launch back to error state when navigation rejects', async () => {
    vi.spyOn(router, 'navigate').mockRejectedValue(new Error('navigation failed'));

    component.updateLaunchValue('locationId', 'loc-456');
    await component.openLaunch(findLaunchCard('locationId'));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('LOCATION.LANDING.ERROR.NAVIGATE');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('builds the expected router commands for the defaults guided launch', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('defaultsLocationId', 'loc-789');
    await component.openLaunch(findLaunchCard('defaultsLocationId'));

    expect(navigateSpy).toHaveBeenLastCalledWith([
      '/app',
      'location',
      'locations',
      'loc-789',
      'defaults',
    ]);
  });
});

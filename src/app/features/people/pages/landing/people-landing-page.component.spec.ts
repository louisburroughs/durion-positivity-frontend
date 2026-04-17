import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PeopleLandingPageComponent } from './people-landing-page.component';

describe('PeopleLandingPageComponent', () => {
  let fixture: ComponentFixture<PeopleLandingPageComponent>;
  let component: PeopleLandingPageComponent;
  let router: Router;

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
    await TestBed.configureTestingModule({
      imports: [PeopleLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(PeopleLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders all direct people links on the landing page', () => {
    const directLinks = fixture.debugElement.queryAll(By.css('a.people-button--primary, a.people-button--secondary'));

    expect(directLinks.length).toBe(7);
  });

  it('shows inline validation when a guided launch is missing its identifier', () => {
    const launchButton = fixture.debugElement.query(By.css('[data-testid="personUuid-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    const launchInput = fixture.debugElement.query(By.css('input[name="personUuid"]')).nativeElement;
    const errorMessage = fixture.debugElement.query(By.css('.people-field__error'));

    expect(errorMessage).toBeTruthy();
    expect(launchInput.getAttribute('aria-invalid')).toBe('true');
    expect(launchInput.getAttribute('aria-describedby')).toBe('personUuid-error');
  });

  it('navigates to a contextual people page when a guided launch value is provided', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.updateLaunchValue('personUuid', 'person-123');
    fixture.detectChanges();

    const launchButton = fixture.debugElement.query(By.css('[data-testid="personUuid-launch"]'));
    launchButton.nativeElement.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/app', 'people', 'rbac', 'person-123']);
  });

  it('moves the launch back to error state when navigation resolves false', async () => {
    vi.spyOn(router, 'navigate').mockResolvedValue(false);

    component.updateLaunchValue('personUuid', 'person-123');
    await component.openLaunch(findLaunchCard('personUuid'));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PEOPLE.LANDING.ERROR.NAVIGATE');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('moves the launch back to error state when navigation rejects', async () => {
    vi.spyOn(router, 'navigate').mockRejectedValue(new Error('navigation failed'));

    component.updateLaunchValue('sessionId', 'session-123');
    await component.openLaunch(findLaunchCard('sessionId'));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PEOPLE.LANDING.ERROR.NAVIGATE');
    expect(component.activeLaunchField()).toBeNull();
  });

  it('builds the expected router commands for the remaining guided pages', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const cases = [
      {
        field: 'employeeProfileId',
        value: 'emp-17',
        expected: ['/app', 'people', 'employees', 'emp-17'],
      },
      {
        field: 'employeeOffboardId',
        value: 'emp-23',
        expected: ['/app', 'people', 'employees', 'emp-23', 'offboard'],
      },
      {
        field: 'personLocationId',
        value: 'person-88',
        expected: ['/app', 'people', 'person', 'person-88', 'locations'],
      },
    ] as const;

    for (const testCase of cases) {
      component.updateLaunchValue(testCase.field, testCase.value);
      await component.openLaunch(findLaunchCard(testCase.field));
      expect(navigateSpy).toHaveBeenLastCalledWith(testCase.expected);
    }
  });
});

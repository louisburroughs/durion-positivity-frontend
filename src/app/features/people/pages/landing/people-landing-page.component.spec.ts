import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { PeopleAPIService } from '@durion-sdk/people';
import { PeopleLandingPageComponent } from './people-landing-page.component';
import { BulkImportService } from '../../../bulk-import/services/bulk-import.service';

describe('PeopleLandingPageComponent', () => {
  let fixture: ComponentFixture<PeopleLandingPageComponent>;
  let component: PeopleLandingPageComponent;
  let router: Router;
  const bulkImportService = {
    getActiveJobDomains: vi.fn(),
  };
  const peopleApi = {
    getAllPeople: vi.fn().mockReturnValue(of([])),
    getPersonById: vi.fn().mockReturnValue(of(null)),
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
      imports: [PeopleLandingPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BulkImportService, useValue: bulkImportService },
        { provide: PeopleAPIService, useValue: peopleApi },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(PeopleLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('fetches and renders the active import indicator for the people import card', () => {
    bulkImportService.getActiveJobDomains.mockReturnValue(of(new Set(['PEOPLE'])));
    fixture = TestBed.createComponent(PeopleLandingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const activeIndicators = fixture.debugElement.queryAll(By.css('.people-card__active-import'));

    expect(bulkImportService.getActiveJobDomains).toHaveBeenCalled();
    expect(activeIndicators).toHaveLength(1);
  });

  it('renders all direct people links on the landing page', () => {
    const directLinks = fixture.debugElement.queryAll(By.css('a.people-button--primary, a.people-button--secondary'));

    expect(directLinks.length).toBe(component.directLinkCount + 2);
  });

  it('shows inline validation when a plain-input guided launch is missing its identifier', () => {
    // sessionId is the one launch card that keeps a raw text input (not a person typeahead).
    const launchButton = fixture.debugElement.query(By.css('[data-testid="sessionId-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    const launchInput = fixture.debugElement.query(By.css('input[name="sessionId"]')).nativeElement;
    const errorMessage = fixture.debugElement.query(By.css('.people-field__error'));

    expect(errorMessage).toBeTruthy();
    expect(launchInput.getAttribute('aria-invalid')).toBe('true');
    expect(launchInput.getAttribute('aria-describedby')).toBe('sessionId-error');
  });

  it('renders a person typeahead for each person-scoped launch card', () => {
    const lookups = fixture.debugElement.queryAll(By.css('app-person-lookup'));
    // Employee Profile, Employee Offboard, Role Assignment, Person Locations.
    expect(lookups).toHaveLength(4);
  });

  it('marks the typeahead input invalid and describes the error on failed launch', () => {
    const launchButton = fixture.debugElement.query(By.css('[data-testid="personUuid-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    const lookupInput = fixture.debugElement.query(By.css('#personUuid')).nativeElement;
    expect(lookupInput.getAttribute('aria-invalid')).toBe('true');
    expect(lookupInput.getAttribute('aria-describedby')).toBe('personUuid-error');
  });

  it('clears the field error when the user updates the launch value', () => {
    // Trigger a validation error first
    const launchButton = fixture.debugElement.query(By.css('[data-testid="personUuid-launch"]'));
    launchButton.nativeElement.click();
    fixture.detectChanges();

    // Verify error is set
    expect(component.launchError('personUuid')).not.toBeNull();

    // Now update the value
    component.updateLaunchValue('personUuid', 'some-uuid');
    fixture.detectChanges();

    // Error should be cleared
    expect(component.launchError('personUuid')).toBeNull();
    // And error display should be gone
    const errorMessage = fixture.debugElement.query(By.css('.people-field__error'));
    expect(errorMessage).toBeNull();
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

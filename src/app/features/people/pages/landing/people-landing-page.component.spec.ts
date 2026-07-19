import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeopleAPIService } from '@durion-sdk/people-contact';
import { PeopleLandingPageComponent } from './people-landing-page.component';

describe('PeopleLandingPageComponent', () => {
  let component: PeopleLandingPageComponent;
  const peopleApi = {
    getAllPeople: vi.fn().mockReturnValue(
      of([{ id: 'PER-1', firstName: 'Ada', lastName: 'Lovelace', primaryEmail: 'ada@x.io' }]),
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [PeopleLandingPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: PeopleAPIService, useValue: peopleApi }],
    });
    component = TestBed.createComponent(PeopleLandingPageComponent).componentInstance;
  });

  it('supplies the people landing config', () => {
    expect(component.config.titleKey).toBe('PEOPLE.LANDING.TITLE');
    expect(component.config.sections.length).toBe(6);
  });

  it('scopes employee + person sections to the right record kinds', () => {
    const byTitle = (t: string) => component.config.sections.find(s => s.titleKey === t);
    expect(byTitle('PEOPLE.LANDING.SECTION.EMPLOYEES.TITLE')?.recordKind).toBe('employee');
    expect(byTitle('PEOPLE.LANDING.SECTION.ACCESS.TITLE')?.recordKind).toBe('person');
    expect(byTitle('PEOPLE.LANDING.SECTION.TIMEKEEPING.TITLE')?.recordKind).toBe('session');
  });

  it('searches employees scoped to EMPLOYEE and adapts to finder hits', () => {
    let hits: ReadonlyArray<{ id: string; primary: string; secondary?: string }> = [];
    component.searchFns.employee!('ada').subscribe(r => (hits = r));
    expect(peopleApi.getAllPeople).toHaveBeenCalledWith('ada');
    expect(hits[0]).toEqual({ id: 'PER-1', primary: 'Ada Lovelace', secondary: 'ada@x.io' });
  });

  it('searches all persons via the identity directory', () => {
    component.searchFns.person!('ada').subscribe();
    expect(peopleApi.getAllPeople).toHaveBeenCalledWith('ada');
  });
});

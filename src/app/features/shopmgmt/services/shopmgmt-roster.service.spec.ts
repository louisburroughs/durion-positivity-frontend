import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ShopmgmtRosterService } from './shopmgmt-roster.service';
import { PeopleAPIService, Person } from '@durion-sdk/people-contact';

// ADR-0032: typed as the exact domain interface
const samplePerson: Person = { id: 'p1', firstName: 'Alex', lastName: 'Smith' };

const peopleApiStub = {
  listPeople: vi.fn(),
  createPerson: vi.fn(),
};

describe('ShopmgmtRosterService', () => {
  let service: ShopmgmtRosterService;

  beforeEach(() => {
    vi.clearAllMocks();
    peopleApiStub.listPeople.mockReturnValue(of([samplePerson]));
    peopleApiStub.createPerson.mockReturnValue(of(samplePerson));

    TestBed.configureTestingModule({
      providers: [
        ShopmgmtRosterService,
        { provide: PeopleAPIService, useValue: peopleApiStub },
      ],
    });

    service = TestBed.inject(ShopmgmtRosterService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates getAllPeople() to PeopleAPIService.getAllPeople()', () => {
    service.getAllPeople().subscribe();

    expect(peopleApiStub.listPeople).toHaveBeenCalledTimes(1);
  });

  it('delegates createPerson() to PeopleAPIService.createPerson() with firstName, lastName, primaryEmail', () => {
    service.createPerson({ firstName: 'Robin', lastName: 'Lane', primaryEmail: 'robin@example.com' }).subscribe();

    expect(peopleApiStub.createPerson).toHaveBeenCalledWith({
      firstName: 'Robin',
      lastName: 'Lane',
      primaryEmail: 'robin@example.com',
    });
  });

  it('passes primaryEmail when provided in createPerson()', () => {
    service.createPerson({ firstName: 'Sam', lastName: 'Jones', primaryEmail: 'sam@example.com' }).subscribe();

    expect(peopleApiStub.createPerson).toHaveBeenCalledWith(
      expect.objectContaining({ primaryEmail: 'sam@example.com' }),
    );
  });

  it('omits primaryEmail from createPerson() call when not provided', () => {
    service.createPerson({ firstName: 'Sam', lastName: 'Jones' }).subscribe();

    const call = peopleApiStub.createPerson.mock.calls[0][0] as Record<string, unknown>;
    expect(call['primaryEmail']).toBeUndefined();
  });
});

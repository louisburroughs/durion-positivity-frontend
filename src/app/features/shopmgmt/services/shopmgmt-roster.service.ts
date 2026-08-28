import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PeopleAPIService, Person } from '@durion-sdk/people-contact';

export interface CreatePersonRequest {
  firstName: string;
  lastName: string;
  primaryEmail?: string;
}

@Injectable({ providedIn: 'root' })
export class ShopmgmtRosterService {
  private readonly peopleApi = inject(PeopleAPIService);

  getAllPeople(): Observable<Person[]> {
    return this.peopleApi.listPeople();
  }

  // NOTE: The original page posted to /v1/people/employees with {firstName, lastName, email, role}.
  // The SDK EmployeeAPIService.createEmployee() requires a different contract (legalName, employeeNumber,
  // status, hireDate). createPerson() is the correct SDK call for person-level creation with name and email.
  // The `role` field from the old form is dropped — it was not part of the backend contract.
  // Defect CAP-320-D1: EmployeeAPIService.createEmployee contract incompatible with roster form.
  createPerson(req: CreatePersonRequest): Observable<Person> {
    return this.peopleApi.createPerson({ firstName: req.firstName, lastName: req.lastName, primaryEmail: req.primaryEmail });
  }
}

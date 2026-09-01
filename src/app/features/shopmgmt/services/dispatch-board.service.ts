import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DailyDispatchBoardDashboardService } from '@durion-sdk/workorder';
import { PeopleAvailabilityAPIService, PeopleAvailabilityResponse, PrimaryLocationResponse } from '@durion-sdk/people';
import { DashboardResponse } from '../models/dispatch-board.models';

/**
 * The SDK's `PrimaryLocationResponse` always carries a location; a persona
 * with no primary assignment is answered with 404 instead. The pages treat a
 * blank `locationId` as their location-required state, so 404 is surfaced as
 * that blank rather than as an error (#201).
 */
export type PrimaryLocation = Partial<PrimaryLocationResponse>;

@Injectable({ providedIn: 'root' })
export class DispatchBoardService {
  private readonly dispatchDashboard = inject(DailyDispatchBoardDashboardService);
  private readonly peopleAvailabilityApi = inject(PeopleAvailabilityAPIService);

  getDashboard(locationId: string, date: string): Observable<DashboardResponse> {
    const normalizedDate = this.toIsoDate(date);
    return this.dispatchDashboard.getDispatchDashboard(locationId.trim(), normalizedDate) as Observable<DashboardResponse>;
  }

  getPrimaryLocation(): Observable<PrimaryLocation> {
    return this.peopleAvailabilityApi.getMyPrimaryLocation().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          // Expected data absence, not a failure: no primary location assigned.
          return of({ locationId: undefined });
        }
        // Authentication, authorization and server errors stay visible.
        return throwError(() => error);
      }),
    );
  }

  getAvailability(locationId: string, date: string): Observable<PeopleAvailabilityResponse[]> {
    const normalizedDate = this.toIsoDate(date);
    return this.peopleAvailabilityApi.listPeopleAvailability(locationId.trim(), normalizedDate);
  }

  private toIsoDate(value: string): string {
    // Accept an already-correct date string to avoid timezone drift.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }

    return parsed.toISOString().slice(0, 10);
  }
}

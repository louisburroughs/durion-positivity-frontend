import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DailyDispatchBoardDashboardService } from '@durion-sdk/workorder';
import { PeopleAvailabilityAPIService, PeopleAvailabilityResponse, PrimaryLocationResponse } from '@durion-sdk/people';
import { DashboardResponse } from '../models/dispatch-board.models';

@Injectable({ providedIn: 'root' })
export class DispatchBoardService {
  private readonly dispatchDashboard = inject(DailyDispatchBoardDashboardService);
  private readonly peopleAvailabilityApi = inject(PeopleAvailabilityAPIService);

  getDashboard(locationId: string, date: string): Observable<DashboardResponse> {
    const normalizedDate = this.toIsoDate(date);
    return this.dispatchDashboard.getDashboard(locationId.trim(), normalizedDate) as Observable<DashboardResponse>;
  }

  getPrimaryLocation(): Observable<PrimaryLocationResponse> {
    return this.peopleAvailabilityApi.getCurrentUserPrimaryLocation();
  }

  getAvailability(locationId: string, date: string): Observable<PeopleAvailabilityResponse[]> {
    const normalizedDate = this.toIsoDate(date);
    return this.peopleAvailabilityApi.getPeopleAvailability(locationId.trim(), normalizedDate);
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

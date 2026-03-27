import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { DashboardResponse } from '../models/dispatch-board.models';

@Injectable({ providedIn: 'root' })
export class DispatchBoardService {
  constructor(private readonly api: ApiBaseService) {}

  getDashboard(locationId: string, date: string): Observable<DashboardResponse> {
    const normalizedDate = this.toIsoDate(date);
    let params = new HttpParams().set('date', normalizedDate);

    if (locationId.trim().length > 0) {
      params = params.set('locationId', locationId.trim());
    }

    return this.api.get<DashboardResponse>('/v1/workexec/dashboard/today', params);
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

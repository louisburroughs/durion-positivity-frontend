import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { WorkSessionDto, WorkSessionsAPIService } from '@durion-sdk/people';

@Injectable({ providedIn: 'root' })
export class WorkSessionService {
  private readonly workSessionsApi = inject(WorkSessionsAPIService);

  startSession(personId: string): Observable<WorkSessionDto> {
    return this.workSessionsApi.startWorkSession({ personId });
  }

  stopSession(personId: string): Observable<WorkSessionDto> {
    return this.workSessionsApi.stopWorkSession({ personId });
  }

  startBreak(sessionId: string): Observable<{ startedAt?: string; endedAt?: string }> {
    return this.workSessionsApi.startWorkSessionBreak(sessionId);
  }

  stopBreak(sessionId: string): Observable<{ startedAt?: string; endedAt?: string }> {
    return this.workSessionsApi.stopWorkSessionBreak(sessionId);
  }
}
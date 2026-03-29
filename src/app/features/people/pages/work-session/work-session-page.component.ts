import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-work-session-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './work-session-page.component.html',
  styleUrl: './work-session-page.component.css',
})
export class WorkSessionPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly peopleService = inject(PeopleService);

  readonly currentSession = signal<object | null>(null);
  readonly workorderId = signal('');
  readonly locationId = signal('');
  readonly loading = signal(false);
  readonly onBreak = signal(false);
  readonly startSuccess = signal(false);
  readonly stopSuccess = signal(false);
  readonly breakStarted = signal(false);
  readonly breakStopped = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.workorderId.set(params['workorderId'] ?? '');
      this.locationId.set(params['locationId'] ?? '');
    });
  }

  startSession(): void {
    const workorderId = this.workorderId();
    const locationId = this.locationId();
    if (!workorderId || !locationId) {
      this.error.set('PEOPLE.WORK_SESSION.ERROR.REQUIRED_IDS');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.startSuccess.set(false);

    this.peopleService.startWorkSession({ workorderId, locationId }).subscribe({
      next: (session) => {
        this.currentSession.set(session as object);
        this.startSuccess.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('PEOPLE.WORK_SESSION.ERROR.START');
        this.loading.set(false);
      },
    });
  }

  stopSession(sessionId: string): void {
    this.loading.set(true);
    this.stopSuccess.set(false);

    this.peopleService.stopWorkSession({ sessionId }).subscribe({
      next: () => {
        this.currentSession.set(null);
        this.onBreak.set(false);
        this.stopSuccess.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('PEOPLE.WORK_SESSION.ERROR.STOP');
        this.loading.set(false);
      },
    });
  }

  startBreak(sessionId: string): void {
    this.peopleService.startBreak(sessionId, {}).subscribe({
      next: () => {
        this.onBreak.set(true);
        this.breakStarted.set(true);
      },
      error: () => {
        this.error.set('PEOPLE.WORK_SESSION.ERROR.START_BREAK');
      },
    });
  }

  stopBreak(sessionId: string): void {
    this.peopleService.stopBreak(sessionId, {}).subscribe({
      next: () => {
        this.onBreak.set(false);
        this.breakStopped.set(true);
      },
      error: () => {
        this.error.set('PEOPLE.WORK_SESSION.ERROR.STOP_BREAK');
      },
    });
  }

  getSessionId(): string {
    const current = this.currentSession() as Record<string, unknown> | null;
    return String(current?.['sessionId'] ?? '');
  }
}

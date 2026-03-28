import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-work-session-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './work-session-page.component.html',
  styleUrl: './work-session-page.component.css',
})
export class WorkSessionPageComponent {
  private readonly peopleService = inject(PeopleService);

  readonly currentSession = signal<object | null>(null);
  readonly loading = signal(false);
  readonly onBreak = signal(false);
  readonly startSuccess = signal(false);
  readonly stopSuccess = signal(false);
  readonly breakStarted = signal(false);
  readonly breakStopped = signal(false);
  readonly error = signal<string | null>(null);

  startSession(): void {
    this.loading.set(true);
    this.error.set(null);
    this.startSuccess.set(false);

    this.peopleService.startWorkSession({ workorderId: 'workorder-1', locationId: 'location-1' }).subscribe({
      next: (session) => {
        this.currentSession.set(session as object);
        this.startSuccess.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to start session.');
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
        this.error.set('Failed to stop session.');
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
        this.error.set('Failed to start break.');
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
        this.error.set('Failed to stop break.');
      },
    });
  }

  getSessionId(): string {
    const current = this.currentSession() as Record<string, unknown> | null;
    return String(current?.['sessionId'] ?? 'session-1');
  }
}

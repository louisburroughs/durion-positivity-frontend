import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TimerWidgetPageComponent } from './timer-widget-page.component';
import { WorkexecService } from '../../services/workexec.service';

describe('TimerWidgetPageComponent', () => {
  let fixture: ComponentFixture<TimerWidgetPageComponent>;
  let component: TimerWidgetPageComponent;
  let workexecService: {
    getActiveTimerEntries: ReturnType<typeof vi.fn>;
    startTimer: ReturnType<typeof vi.fn>;
    stopTimers: ReturnType<typeof vi.fn>;
  };

  const STOPPED_ENTRY = {
    timeEntryId: 'TE-1',
    status: 'COMPLETED',
    startTime: '2026-01-01T09:00:00Z',
    endTime: '2026-01-01T10:00:00Z',
    durationInSeconds: 3600,
    workOrderId: 'WO-1',
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    workexecService = {
      getActiveTimerEntries: vi.fn().mockReturnValue(of({ active: [] })),
      startTimer: vi.fn().mockReturnValue(
        of({ timeEntryId: 'TE-1', status: 'ACTIVE', startTime: '2026-01-01T09:00:00Z', workOrderId: 'WO-1' }),
      ),
      stopTimers: vi.fn().mockReturnValue(of({ stopped: [STOPPED_ENTRY] })),
    };

    await TestBed.configureTestingModule({
      imports: [TimerWidgetPageComponent],
      providers: [
        { provide: WorkexecService, useValue: workexecService },
        { provide: ActivatedRoute, useValue: { queryParams: of({ workOrderId: 'WO-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TimerWidgetPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // triggers ngOnInit → loadActiveTimers
  });

  it('renders job timer heading', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toContain('Job Timer');
  });

  it('shows idle state initially when no active timer', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="timer-idle-indicator"]');
    expect(el).toBeTruthy();
  });

  it('start timer button enabled when workOrderId present and no active timer', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="start-timer-btn"]');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });

  it('start timer sets timerState to ACTIVE on success', () => {
    workexecService.getActiveTimerEntries.mockReturnValue(
      of({ active: [{ timeEntryId: 'TE-1', workOrderId: 'WO-1', startTime: '2026-01-01T09:00:00Z' }] }),
    );
    component.startTimer();
    fixture.detectChanges();

    expect(component.timerState()).toBe('ACTIVE');
  });

  it('shows active indicator after starting timer', () => {
    workexecService.getActiveTimerEntries.mockReturnValue(
      of({ active: [{ timeEntryId: 'TE-1', workOrderId: 'WO-1', startTime: '2026-01-01T09:00:00Z' }] }),
    );
    component.startTimer();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('[data-testid="timer-active-indicator"]');
    expect(el).toBeTruthy();
  });

  it('stop button enabled when active timer present', () => {
    // Place the component into an active state with a populated activeTimers list
    component.activeTimers.set([{ timeEntryId: 'TE-1', workOrderId: 'WO-1', startTime: '2026-01-01T09:00:00Z' }]);
    component.timerState.set('ACTIVE');
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('[data-testid="stop-timer-btn"]');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });

  it('stopTimers sets timerState to NONE on success', () => {
    component.activeTimers.set([{ timeEntryId: 'TE-1', workOrderId: 'WO-1', startTime: '2026-01-01T09:00:00Z' }]);
    component.timerState.set('ACTIVE');
    fixture.detectChanges();

    component.stopTimers();
    fixture.detectChanges();

    expect(component.timerState()).toBe('NONE');
  });

  it('shows stopped entries table after stopping timer', () => {
    component.activeTimers.set([{ timeEntryId: 'TE-1', workOrderId: 'WO-1', startTime: '2026-01-01T09:00:00Z' }]);
    component.timerState.set('ACTIVE');
    fixture.detectChanges();

    component.stopTimers();
    fixture.detectChanges();

    const table = fixture.nativeElement.querySelector('[data-testid="stopped-entries-table"]');
    expect(table).toBeTruthy();
  });

  it('shows action error on startTimer failure', () => {
    workexecService.startTimer.mockReturnValue(
      throwError(() => ({ error: { message: 'Conflict' } })),
    );

    component.startTimer();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('[data-testid="action-error"]');
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('Conflict');
  });
});

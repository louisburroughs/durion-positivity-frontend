import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { WorkSessionDto } from '@durion-sdk/people';
import { of, throwError } from 'rxjs';
import { WorkSessionPageComponent } from './work-session-page.component';
import { WorkSessionService } from '../../services/work-session.service';

const translations = {
  PEOPLE: {
    WORK_SESSION: {
      TITLE: 'Work Session',
      ACTIVE: 'Session active',
      INACTIVE: 'No active session',
      ON_BREAK: 'On break',
      CONTROLS: 'Session controls',
      BREAK_FORM_ARIA: 'Break controls form',
      BREAK_TYPE: 'Break Type',
      NOTES: 'Notes',
      TODAYS_BREAKS: "Today's Breaks",
      LOADING_BREAKS: 'Loading breaks...',
      STARTED_AT: 'Started At',
      ENDED_AT: 'Ended At',
      AUTO_ENDED: 'Auto Ended',
      START_SESSION: 'Start session',
      STOP_SESSION: 'Stop session',
      START_BREAK: 'Start break',
      STOP_BREAK: 'Stop break',
      ACTION_SUCCEEDED: 'Action succeeded.',
    },
  },
  COMMON: {
    YES: 'Yes',
    NO: 'No',
  },
};

describe('WorkSessionPageComponent', () => {
  let fixture: ComponentFixture<WorkSessionPageComponent>;
  let component: WorkSessionPageComponent;
  let workSessionService: {
    startSession: ReturnType<typeof vi.fn>;
    stopSession: ReturnType<typeof vi.fn>;
    startBreak: ReturnType<typeof vi.fn>;
    stopBreak: ReturnType<typeof vi.fn>;
  };

  const activeSession: WorkSessionDto = {
    sessionId: 's-1',
    personId: 'person-001',
    startedAt: '2026-04-25T08:00:00Z',
  };

  const stoppedSession: WorkSessionDto = {
    sessionId: 's-1',
    personId: 'person-001',
    startedAt: '2026-04-25T08:00:00Z',
    endedAt: '2026-04-25T17:00:00Z',
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    workSessionService = {
      startSession: vi.fn().mockReturnValue(of(activeSession)),
      stopSession: vi.fn().mockReturnValue(of(stoppedSession)),
      startBreak: vi.fn().mockReturnValue(of({ startedAt: '12:00', endedAt: undefined })),
      stopBreak: vi.fn().mockReturnValue(of({ startedAt: '12:00', endedAt: '12:30' })),
    };

    await TestBed.configureTestingModule({
      imports: [WorkSessionPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkSessionService, useValue: workSessionService },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({ personId: 'person-001' }),
            params: of({}),
          },
        },
      ],
    }).compileComponents();

    const translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('en-US', translations);
    translateService.use('en-US');

    fixture = TestBed.createComponent(WorkSessionPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('T1: renders translated work-session heading and controls', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    const h2 = fixture.nativeElement.querySelector('h2');
    const clockInButton = fixture.nativeElement.querySelector('[data-testid="clock-in-btn"]');
    const clockOutButton = fixture.nativeElement.querySelector('[data-testid="clock-out-btn"]');

    expect(h1).toBeTruthy();
    expect(h2).toBeTruthy();
    expect(clockInButton).toBeTruthy();
    expect(clockOutButton).toBeTruthy();
    expect(h1.textContent).toContain('Work Session');
    expect(h2.textContent).toContain('Session controls');
    expect(clockInButton.textContent).toContain('Start session');
    expect(clockOutButton.textContent).toContain('Stop session');
  });

  it('T2: clock-in-btn is present and not disabled initially', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="clock-in-btn"]');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });

  it('T3: clock-out-btn is disabled when not clocked in', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="clock-out-btn"]');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });

  it('T4: clicking clock-in-btn calls startWorkSession; on success shows action-success and sets clock status to Clocked In', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="clock-in-btn"]');
    btn.click();
    fixture.detectChanges();
    expect(workSessionService.startSession).toHaveBeenCalledWith('person-001');
    const successEl = fixture.nativeElement.querySelector('[data-testid="action-success"]');
    expect(successEl).toBeTruthy();
    expect(successEl.textContent).toContain('Action succeeded.');
    const clockStatus = fixture.nativeElement.querySelector('[data-testid="clock-status"]');
    expect(clockStatus.textContent).toContain('Session active');
  });

  it('T5: shows error-state when startWorkSession fails', () => {
    workSessionService.startSession.mockReturnValue(
      throwError(() => ({ error: { message: 'Clock in failed' } })),
    );
    component.startSession();
    fixture.detectChanges();
    const errEl = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(errEl).toBeTruthy();
    expect(errEl.textContent).toContain('Clock in failed');
  });

  it('T6: clock-out-btn enabled after session starts (set currentSession signal directly)', () => {
    component.currentSession.set({ sessionId: 'sess1' });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="clock-out-btn"]');
    expect(btn.disabled).toBe(false);
  });

  it('T7: start-break-btn is visible when isClocked (set currentSession signal)', () => {
    component.currentSession.set({ sessionId: 'sess1' });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="start-break-btn"]');
    expect(btn).toBeTruthy();
  });

  it('T8: clicking start-break-btn calls startBreak with breakType from form', () => {
    component.currentSession.set({ sessionId: 'sess1' });
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="start-break-btn"]');
    btn.click();
    fixture.detectChanges();
    expect(workSessionService.startBreak).toHaveBeenCalledWith('sess1');
    expect(component.breaks()).toEqual([
      {
        breakType: 'MEAL',
        startedAt: '12:00',
        endedAt: undefined,
        autoEnded: false,
      },
    ]);
  });

  it('T9: stop-break-btn calls stopBreak; onBreak resets to false', () => {
    component.currentSession.set({ sessionId: 'sess1' });
    component.breaks.set([{ breakType: 'MEAL', startedAt: '12:00' }]);
    component.onBreak.set(true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="stop-break-btn"]');
    btn.click();
    fixture.detectChanges();
    expect(workSessionService.stopBreak).toHaveBeenCalledWith('sess1');
    expect(component.onBreak()).toBe(false);
    expect(component.breaks()[0]?.endedAt).toBe('12:30');
  });

  it('T10: breaks-table shows break items after loadBreaks returns data', () => {
    component.breaks.set([{ breakType: 'MEAL', startedAt: '12:00', endedAt: '12:30', autoEnded: false }]);
    component.breaksLoading.set(false);
    fixture.detectChanges();
    const breaksHeading = fixture.nativeElement.querySelectorAll('h2')[1];
    const table = fixture.nativeElement.querySelector('[data-testid="breaks-table"]');
    expect(table).toBeTruthy();
    expect(breaksHeading.textContent).toContain("Today's Breaks");
    expect(table.textContent).toContain('Break Type');
    expect(table.textContent).toContain('Started At');
    expect(table.textContent).toContain('Ended At');
    expect(table.textContent).toContain('Auto Ended');
    expect(table.textContent).toContain('No');
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="break-item"]');
    expect(rows.length).toBe(1);
  });

  it('shows the required-ids error and does not call the service when personId is absent', () => {
    component.personId.set('');

    component.startSession();
    fixture.detectChanges();

    expect(workSessionService.startSession).not.toHaveBeenCalled();
    const errEl = fixture.nativeElement.querySelector('[data-testid="error-state"]');
    expect(errEl?.textContent).toContain('PEOPLE.WORK_SESSION.ERROR.REQUIRED_IDS');
  });
});

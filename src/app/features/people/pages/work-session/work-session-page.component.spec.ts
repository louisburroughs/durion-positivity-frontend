import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WorkSessionPageComponent } from './work-session-page.component';
import { PeopleService } from '../../services/people.service';

describe('WorkSessionPageComponent', () => {
  let fixture: ComponentFixture<WorkSessionPageComponent>;
  let component: WorkSessionPageComponent;
  let peopleService: {
    startWorkSession: ReturnType<typeof vi.fn>;
    stopWorkSession: ReturnType<typeof vi.fn>;
    startBreak: ReturnType<typeof vi.fn>;
    stopBreak: ReturnType<typeof vi.fn>;
    getWorkSessionBreaks: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();

    peopleService = {
      startWorkSession: vi.fn().mockReturnValue(of({ sessionId: 's-1', clockedInAt: '08:00' })),
      stopWorkSession: vi.fn().mockReturnValue(of({ sessionId: 's-1', clockedOutAt: '17:00' })),
      startBreak: vi.fn().mockReturnValue(of({ breakId: 'b-1' })),
      stopBreak: vi.fn().mockReturnValue(of({ breakId: 'b-1' })),
      getWorkSessionBreaks: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [WorkSessionPageComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: peopleService },
        { provide: ActivatedRoute, useValue: { params: of({ workorderId: 'wo-1', locationId: 'loc-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkSessionPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('T1: renders Work Session heading', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toContain('Work Session');
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
    expect(peopleService.startWorkSession).toHaveBeenCalledTimes(1);
    const successEl = fixture.nativeElement.querySelector('[data-testid="action-success"]');
    expect(successEl).toBeTruthy();
    const clockStatus = fixture.nativeElement.querySelector('[data-testid="clock-status"]');
    expect(clockStatus.textContent).toContain('Clocked In');
  });

  it('T5: shows error-state when startWorkSession fails', () => {
    peopleService.startWorkSession.mockReturnValue(
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
    expect(peopleService.startBreak).toHaveBeenCalledWith('sess1', { breakType: 'MEAL' }, expect.any(String));
  });

  it('T9: stop-break-btn calls stopBreak; onBreak resets to false', () => {
    component.currentSession.set({ sessionId: 'sess1' });
    component.onBreak.set(true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="stop-break-btn"]');
    btn.click();
    fixture.detectChanges();
    expect(peopleService.stopBreak).toHaveBeenCalledWith('sess1', {}, expect.any(String));
    expect(component.onBreak()).toBe(false);
  });

  it('T10: breaks-table shows break items after loadBreaks returns data', () => {
    component.breaks.set([{ breakType: 'MEAL', startedAt: '12:00', endedAt: '12:30', autoEnded: false }]);
    component.breaksLoading.set(false);
    fixture.detectChanges();
    const table = fixture.nativeElement.querySelector('[data-testid="breaks-table"]');
    expect(table).toBeTruthy();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="break-item"]');
    expect(rows.length).toBe(1);
  });
});

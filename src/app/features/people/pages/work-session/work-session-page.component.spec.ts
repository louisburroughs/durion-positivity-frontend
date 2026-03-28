import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { WorkSessionPageComponent } from './work-session-page.component';
import { PeopleService } from '../../services/people.service';

const stubPeopleService = {
  startWorkSession: vi.fn(),
  stopWorkSession: vi.fn(),
  startBreak: vi.fn(),
  stopBreak: vi.fn(),
};

const DEFAULT_ROUTE_PARAMS: Record<string, string> = { workorderId: 'wo-1', locationId: 'loc-1' };

describe('WorkSessionPageComponent [CAP-139]', () => {
  let fixture: ComponentFixture<WorkSessionPageComponent>;
  let component: WorkSessionPageComponent;

  const setup = async (routeParams: Record<string, string> = DEFAULT_ROUTE_PARAMS) => {
    vi.clearAllMocks();
    stubPeopleService.startWorkSession.mockReturnValue(of({ sessionId: 's-1' }));
    stubPeopleService.stopWorkSession.mockReturnValue(of({ status: 'ok' }));
    stubPeopleService.startBreak.mockReturnValue(of({ status: 'ok' }));
    stubPeopleService.stopBreak.mockReturnValue(of({ status: 'ok' }));

    await TestBed.configureTestingModule({
      imports: [WorkSessionPageComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: stubPeopleService },
        { provide: ActivatedRoute, useValue: { params: of(routeParams) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkSessionPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders without crashing', async () => {
    await setup();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('shows .session-inactive state initially', async () => {
    await setup();
    const state = fixture.debugElement.query(By.css('.session-inactive'));
    expect(state).toBeTruthy();
  });

  it('calls startWorkSession on start', async () => {
    await setup({ workorderId: 'wo-1', locationId: 'loc-1' });
    component.startSession();
    expect(stubPeopleService.startWorkSession).toHaveBeenCalledWith({
      workorderId: 'wo-1',
      locationId: 'loc-1',
    });
  });

  it('calls stopWorkSession on stop', async () => {
    await setup();
    component.stopSession('s-1');
    expect(stubPeopleService.stopWorkSession).toHaveBeenCalledWith({ sessionId: 's-1' });
  });

  it('calls startBreak on break start', async () => {
    await setup();
    component.startBreak('s-1');
    expect(stubPeopleService.startBreak).toHaveBeenCalledWith('s-1', {});
  });

  it('shows .break-indicator when on break', async () => {
    await setup();
    component.onBreak.set(true);
    fixture.detectChanges();
    const indicator = fixture.debugElement.query(By.css('.break-indicator'));
    expect(indicator).toBeTruthy();
  });

  // T10 — new tests
  it('getSessionId() returns empty string when no session is active', async () => {
    await setup();
    expect(component.getSessionId()).toBe('');
  });

  it('stop/break buttons are disabled when no session active', async () => {
    await setup();
    const stopBtn = fixture.debugElement.query(By.css('.stop-btn'));
    const startBreakBtn = fixture.debugElement.query(By.css('.start-break-btn'));
    const stopBreakBtn = fixture.debugElement.query(By.css('.stop-break-btn'));
    expect((stopBtn.nativeElement as HTMLButtonElement).disabled).toBe(true);
    expect((startBreakBtn.nativeElement as HTMLButtonElement).disabled).toBe(true);
    expect((stopBreakBtn.nativeElement as HTMLButtonElement).disabled).toBe(true);
  });

  it('startSession() shows error when workorderId missing', async () => {
    await setup({ locationId: 'loc-1' });
    component.startSession();
    expect(component.error()).toBeTruthy();
    expect(stubPeopleService.startWorkSession).not.toHaveBeenCalled();
  });

  it('startSession() shows error when locationId missing', async () => {
    await setup({ workorderId: 'wo-1' });
    component.startSession();
    expect(component.error()).toBeTruthy();
    expect(stubPeopleService.startWorkSession).not.toHaveBeenCalled();
  });
});

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { WorkSessionDto, WorkSessionsAPIService } from '@durion-sdk/people';
import { WorkSessionService } from './work-session.service';

describe('WorkSessionService', () => {
  let service: WorkSessionService;

  const workSessionsApiStub = {
    startWorkSession: vi.fn(),
    stopWorkSession: vi.fn(),
    startWorkSessionBreak: vi.fn(),
    stopWorkSessionBreak: vi.fn(),
  };

  const session: WorkSessionDto = {
    sessionId: 'session-001',
    personId: 'person-001',
    startedAt: '2026-04-25T08:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        WorkSessionService,
        { provide: WorkSessionsAPIService, useValue: workSessionsApiStub },
      ],
    });

    service = TestBed.inject(WorkSessionService);
  });

  it('startSession() calls startWorkSession with the personId request object and returns the SDK response', () => {
    workSessionsApiStub.startWorkSession.mockReturnValueOnce(of(session));

    let result: WorkSessionDto | undefined;
    service.startSession('person-001').subscribe(value => {
      result = value;
    });

    expect(workSessionsApiStub.startWorkSession).toHaveBeenCalledWith({ personId: 'person-001' });
    expect(result).toEqual(session);
  });

  it('stopSession() calls stopWorkSession with the personId request object and returns the SDK response', () => {
    workSessionsApiStub.stopWorkSession.mockReturnValueOnce(of(session));

    let result: WorkSessionDto | undefined;
    service.stopSession('person-001').subscribe(value => {
      result = value;
    });

    expect(workSessionsApiStub.stopWorkSession).toHaveBeenCalledWith({ personId: 'person-001' });
    expect(result).toEqual(session);
  });

  it('startBreak() calls startWorkSessionBreak with the sessionId and returns the SDK response', () => {
    const startedBreak = { startedAt: '2026-04-25T12:00:00Z' };
    workSessionsApiStub.startWorkSessionBreak.mockReturnValueOnce(of(startedBreak));

    let result: { startedAt?: string; endedAt?: string } | undefined;
    service.startBreak('session-001').subscribe(value => {
      result = value;
    });

    expect(workSessionsApiStub.startWorkSessionBreak).toHaveBeenCalledWith('session-001');
    expect(result).toEqual(startedBreak);
  });

  it('stopBreak() calls stopWorkSessionBreak with the sessionId and returns the SDK response', () => {
    const stoppedBreak = { startedAt: '2026-04-25T12:00:00Z', endedAt: '2026-04-25T12:30:00Z' };
    workSessionsApiStub.stopWorkSessionBreak.mockReturnValueOnce(of(stoppedBreak));

    let result: { startedAt?: string; endedAt?: string } | undefined;
    service.stopBreak('session-001').subscribe(value => {
      result = value;
    });

    expect(workSessionsApiStub.stopWorkSessionBreak).toHaveBeenCalledWith('session-001');
    expect(result).toEqual(stoppedBreak);
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { WorkSessionPageComponent } from './work-session-page.component';
import { PeopleService } from '../../services/people.service';

const stubPeopleService = {
  startWorkSession: vi.fn(),
  stopWorkSession: vi.fn(),
  startBreak: vi.fn(),
  stopBreak: vi.fn(),
};

describe('WorkSessionPageComponent [CAP-139]', () => {
  let fixture: ComponentFixture<WorkSessionPageComponent>;
  let component: WorkSessionPageComponent;

  const setup = async () => {
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
    await setup();
    component.startSession();
    expect(stubPeopleService.startWorkSession).toHaveBeenCalledWith({
      workorderId: 'workorder-1',
      locationId: 'location-1',
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
});

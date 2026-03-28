import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TravelTimePageComponent } from './travel-time-page.component';
import { WorkexecService } from '../../services/workexec.service';

const stubWorkexecService = {
  startTravelSegment: vi.fn(),
  stopTravelSegment: vi.fn(),
  submitTravelSegments: vi.fn(),
};

describe('TravelTimePageComponent [CAP-139]', () => {
  let fixture: ComponentFixture<TravelTimePageComponent>;
  let component: TravelTimePageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubWorkexecService.startTravelSegment.mockReturnValue(of({ travelSegmentId: 'seg-1' }));
    stubWorkexecService.stopTravelSegment.mockReturnValue(of({ status: 'ok' }));
    stubWorkexecService.submitTravelSegments.mockReturnValue(of({ status: 'ok' }));

    await TestBed.configureTestingModule({
      imports: [TravelTimePageComponent],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: stubWorkexecService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TravelTimePageComponent);
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

  it('shows .travel-inactive initially', async () => {
    await setup();
    const inactive = fixture.debugElement.query(By.css('.travel-inactive'));
    expect(inactive).toBeTruthy();
  });

  it('calls startTravelSegment on startTravel', async () => {
    await setup();
    component.startForm.setValue({
      mobileWorkAssignmentId: 'asg-1',
      workorderId: 'wo-1',
      notes: 'start',
    });
    component.startTravel();

    expect(stubWorkexecService.startTravelSegment).toHaveBeenCalledWith({
      mobileWorkAssignmentId: 'asg-1',
      workorderId: 'wo-1',
      notes: 'start',
    });
  });

  it('calls stopTravelSegment on stopTravel', async () => {
    await setup();
    component.stopTravel('seg-1');
    expect(stubWorkexecService.stopTravelSegment).toHaveBeenCalledWith('seg-1', {});
  });

  it('calls submitTravelSegments on submitAll', async () => {
    await setup();
    component.submitAll('asg-1');
    expect(stubWorkexecService.submitTravelSegments).toHaveBeenCalledWith('asg-1', {});
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MechanicAvailabilityPageComponent } from './mechanic-availability-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { DispatchBoardService } from '../../services/dispatch-board.service';

const dispatchBoardServiceStub = {
  getPrimaryLocation: vi.fn().mockReturnValue(of({ locationId: 'loc-1' })),
  getAvailability: vi.fn().mockReturnValue(of([{ mechanicName: 'Alex', available: true }])),
};

describe('MechanicAvailabilityPageComponent [CAP-138]', () => {
  let fixture: ComponentFixture<MechanicAvailabilityPageComponent>;

  const setup = async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: dispatchBoardServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
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

  it('calls getCurrentUserPrimaryLocation on init', async () => {
    await setup();
    expect(dispatchBoardServiceStub.getPrimaryLocation).toHaveBeenCalledTimes(1);
  });

  it('calls getPeopleAvailability on load', async () => {
    await setup();
    expect(dispatchBoardServiceStub.getAvailability).toHaveBeenCalled();
  });

  it('renders .availability-grid when data loaded', async () => {
    await setup();
    const grid = fixture.debugElement.query(By.css('.availability-grid'));
    expect(grid).toBeTruthy();
  });

  it('does not call getAvailability when primary location lookup fails', async () => {
    vi.clearAllMocks();
    const errorDispatchBoardService = {
      getPrimaryLocation: vi.fn().mockReturnValue(throwError(() => new Error('404'))),
      getAvailability: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: errorDispatchBoardService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
    fixture.detectChanges();

    expect(errorDispatchBoardService.getAvailability).not.toHaveBeenCalled();
    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
  });

  it('prompts for a location when the primary location is blank', async () => {
    vi.clearAllMocks();
    const blankLocationService = {
      getPrimaryLocation: vi.fn().mockReturnValue(of({ locationId: null })),
      getAvailability: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: blankLocationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
    fixture.detectChanges();

    expect(blankLocationService.getAvailability).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBe(
      'SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOCATION_REQUIRED',
    );
  });

  it('requires a location before loading availability', async () => {
    await setup();
    vi.clearAllMocks();

    const component = fixture.componentInstance;
    component.filterForm.controls.locationId.setValue('   ');
    component.loadAvailability();
    fixture.detectChanges();

    expect(dispatchBoardServiceStub.getAvailability).not.toHaveBeenCalled();
    expect(component.error()).toBe('SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOCATION_REQUIRED');
  });

  it('shows .error-banner on error', async () => {
    vi.clearAllMocks();
    const errorDispatchBoardService = {
      getPrimaryLocation: vi.fn().mockReturnValue(of({ locationId: 'loc-1' })),
      getAvailability: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
    };

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: errorDispatchBoardService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
  });
});

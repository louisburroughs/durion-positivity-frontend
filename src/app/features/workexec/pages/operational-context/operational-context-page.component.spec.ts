import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OperationalContextPageComponent } from './operational-context-page.component';
import { WorkexecService } from '../../services/workexec.service';

const stubWorkexecService = {
  getOperationalContext: vi.fn(),
  overrideOperationalContext: vi.fn(),
};

describe('OperationalContextPageComponent [CAP-140]', () => {
  let fixture: ComponentFixture<OperationalContextPageComponent>;
  let component: OperationalContextPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubWorkexecService.getOperationalContext.mockReturnValue(of({ workorderId: 'wo-1', status: 'OPEN' }));
    stubWorkexecService.overrideOperationalContext.mockReturnValue(of({ workorderId: 'wo-1', status: 'OVERRIDDEN' }));

    await TestBed.configureTestingModule({
      imports: [OperationalContextPageComponent],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: stubWorkexecService },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'wo-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OperationalContextPageComponent);
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

  it('loads operational context on init with route param', async () => {
    await setup();
    expect(stubWorkexecService.getOperationalContext).toHaveBeenCalledWith('wo-1');
  });

  it('renders .context-panel', async () => {
    await setup();
    const panel = fixture.debugElement.query(By.css('.context-panel'));
    expect(panel).toBeTruthy();
  });

  it('shows .override-panel when override form opened', async () => {
    await setup();
    component.openOverrideForm();
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.css('.override-panel'));
    expect(panel).toBeTruthy();
  });

  it('calls overrideOperationalContext with workorderId and form data', async () => {
    await setup();
    component.openOverrideForm();
    component.overrideForm.setValue({
      contextKey: 'priority',
      contextValue: 'HIGH',
      overrideReason: 'Manager override',
    });

    component.submitOverride();

    expect(stubWorkexecService.overrideOperationalContext).toHaveBeenCalledWith('wo-1', {
      contextKey: 'priority',
      contextValue: 'HIGH',
      overrideReason: 'Manager override',
    });
  });

  it('shows .success-banner on success', async () => {
    await setup();
    component.openOverrideForm();
    component.overrideForm.setValue({
      contextKey: 'eta',
      contextValue: '30m',
      overrideReason: 'Traffic condition',
    });
    component.submitOverride();
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.success-banner'));
    expect(banner).toBeTruthy();
  });
});

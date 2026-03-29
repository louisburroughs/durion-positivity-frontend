import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { MobileUnitsPageComponent } from './mobile-units-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { LocationService } from '../../services/location.service';

const stubService = {
  listMobileUnits: vi.fn(),
  createMobileUnit: vi.fn(),
  replaceCoverageRules: vi.fn(),
};

describe('MobileUnitsPageComponent [CAP-136]', () => {
  let fixture: ComponentFixture<MobileUnitsPageComponent>;
  let component: MobileUnitsPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubService.listMobileUnits.mockReturnValue(of([{ mobileUnitId: 'mu-1', name: 'Mobile North' }]));
    stubService.createMobileUnit.mockReturnValue(of({ mobileUnitId: 'mu-2' }));
    stubService.replaceCoverageRules.mockReturnValue(of({ success: true }));

    await TestBed.configureTestingModule({
      imports: [MobileUnitsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: stubService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileUnitsPageComponent);
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

  it('calls listMobileUnits on init', async () => {
    await setup();
    expect(stubService.listMobileUnits).toHaveBeenCalledTimes(1);
  });

  it('renders .unit-card for each unit', async () => {
    await setup();
    component.mobileUnits.set([
      { mobileUnitId: 'mu-1', name: 'Mobile North' },
      { mobileUnitId: 'mu-2', name: 'Mobile South' },
    ]);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css('.unit-card'));
    expect(cards.length).toBe(2);
  });

  it('opens create modal', async () => {
    await setup();

    const button = fixture.debugElement.query(By.css('.open-create-btn'));
    button.nativeElement.click();
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('.create-modal-overlay'));
    expect(modal).toBeTruthy();
  });

  it('calls createMobileUnit on submit', async () => {
    await setup();
    component.openCreate();
    component.createName.set('Downtown Unit');
    fixture.detectChanges();

    const submitButton = fixture.debugElement.query(By.css('.submit-create-btn'));
    submitButton.nativeElement.click();

    expect(stubService.createMobileUnit).toHaveBeenCalledWith({ name: 'Downtown Unit' });
  });
});

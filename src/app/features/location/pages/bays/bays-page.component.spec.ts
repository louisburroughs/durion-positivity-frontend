import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { BaysPageComponent } from './bays-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { LocationService } from '../../services/location.service';

const stubService = {
  listBays: vi.fn(),
  createBay: vi.fn(),
  patchBay: vi.fn(),
};

describe('BaysPageComponent [CAP-136]', () => {
  let fixture: ComponentFixture<BaysPageComponent>;
  let component: BaysPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubService.listBays.mockReturnValue(of([{ bayId: 'bay-1', name: 'Bay 1' }]));
    stubService.createBay.mockReturnValue(of({ bayId: 'bay-2' }));
    stubService.patchBay.mockReturnValue(of({ bayId: 'bay-1' }));

    await TestBed.configureTestingModule({
      imports: [BaysPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: stubService },
        { provide: ActivatedRoute, useValue: { params: of({ locationId: 'loc-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BaysPageComponent);
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

  it('calls listBays with locationId from route params', async () => {
    await setup();
    expect(stubService.listBays).toHaveBeenCalledWith('loc-1');
  });

  it('renders .bay-card for each bay', async () => {
    await setup();
    component.bays.set([
      { bayId: 'bay-1', name: 'Bay 1' },
      { bayId: 'bay-2', name: 'Bay 2' },
    ]);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css('.bay-card'));
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

  it('calls createBay on submit', async () => {
    await setup();
    component.openCreate();
    component.createBayName.set('Bay 9');
    fixture.detectChanges();

    const submitButton = fixture.debugElement.query(By.css('.submit-create-btn'));
    submitButton.nativeElement.click();

    expect(stubService.createBay).toHaveBeenCalledWith('loc-1', { name: 'Bay 9' });
  });
});

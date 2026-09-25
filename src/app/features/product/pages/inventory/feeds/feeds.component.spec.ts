import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { FeedsComponent } from './feeds.component';

describe('FeedsComponent', () => {
  let fixture: ComponentFixture<FeedsComponent>;
  let component: FeedsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedsComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedsComponent);
    component = fixture.componentInstance;
  });

  // ── Initial state ─────────────────────────────────────────────────────────────

  it('defaults activeTab to "MFR"', () => {
    expect(component.activeTab()).toBe('MFR');
  });

  it('initializes with state "idle"', () => {
    expect(component.state()).toBe('idle');
  });

  // ── activeTab signal ──────────────────────────────────────────────────────────

  it('activeTab.set("DISTRIBUTOR") updates activeTab signal', () => {
    component.activeTab.set('DISTRIBUTOR');
    expect(component.activeTab()).toBe('DISTRIBUTOR');
  });

  it('activeTab.set("MFR") resets back to MFR', () => {
    component.activeTab.set('DISTRIBUTOR');
    component.activeTab.set('MFR');
    expect(component.activeTab()).toBe('MFR');
  });

  // ── search() ──────────────────────────────────────────────────────────────────

  it('search() with empty sku stays in "idle" state', () => {
    component.sku.set('');
    component.search();

    expect(component.state()).toBe('idle');
  });

  it('search() with a sku shows the vendor-feed-unavailable notice instead of querying a backend contract it cannot serve (backend #2213)', () => {
    component.sku.set('SKU-001');
    component.search();

    expect(component.state()).toBe('unavailable');
  });

  it('search() renders the unavailable state section', () => {
    component.sku.set('SKU-001');
    component.search();
    fixture.detectChanges();

    const notice = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
    expect(notice).toBeTruthy();
  });
});

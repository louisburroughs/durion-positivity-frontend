import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierHealthPanelComponent } from './supplier-health-panel.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { SupplierBindingHealth } from '../../models/supplier-profile.models';

const PROFILE_ID = 'profile-1';

const healthEntries: SupplierBindingHealth[] = [
  {
    capability: 'ORDER',
    bindingId: 'bind-1',
    status: 'HEALTHY',
    breakerState: 'CLOSED',
    consecutiveFailures: 0,
    lastSuccessAt: '2026-08-12T09:00:00Z',
    lastFailureAt: null,
    observedAt: '2026-08-12T09:05:00Z',
    stalenessThresholdMinutes: 120,
  },
  {
    capability: 'PRICE_CATALOG',
    bindingId: 'bind-2',
    status: 'FAILING',
    breakerState: 'OPEN',
    consecutiveFailures: 7,
    lastSuccessAt: '2026-08-10T03:00:00Z',
    lastFailureAt: '2026-08-12T03:00:00Z',
    observedAt: '2026-08-12T09:01:00Z',
    stalenessThresholdMinutes: 60,
  },
  {
    capability: 'STOCK_REPORT',
    bindingId: null,
    status: 'NOT_CONFIGURED',
    breakerState: 'UNKNOWN',
    observedAt: '2026-08-12T09:03:00Z',
    stalenessThresholdMinutes: 0,
  },
];

describe('SupplierHealthPanelComponent', () => {
  let fixture: ComponentFixture<SupplierHealthPanelComponent>;
  let component: SupplierHealthPanelComponent;
  let service: { getHealth: ReturnType<typeof vi.fn> };

  async function setup(
    entries: SupplierBindingHealth[] | HttpErrorResponse = healthEntries,
  ): Promise<void> {
    service = {
      getHealth: vi
        .fn()
        .mockReturnValue(
          entries instanceof HttpErrorResponse ? throwError(() => entries) : of(entries),
        ),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierHealthPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierProfileService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierHealthPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('vendorProfileId', PROFILE_ID);
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the health snapshot for the profile', async () => {
    await setup();

    expect(service.getHealth).toHaveBeenCalledWith(PROFILE_ID);
    expect(component.state()).toBe('ready');
    expect(component.health()).toHaveLength(3);
  });

  it('reports empty when the backend returns no snapshots', async () => {
    await setup([]);

    expect(component.state()).toBe('empty');
  });

  it('sets both state and errorKey when the load fails', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without health data on 403', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x' }));

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).toBeNull();
  });

  it('maps health status and breaker state to distinct tones', async () => {
    await setup();

    expect(component.statusTone('HEALTHY')).toBe('success');
    expect(component.statusTone('DEGRADED')).toBe('warning');
    expect(component.statusTone('FAILING')).toBe('danger');
    expect(component.statusTone('NOT_CONFIGURED')).toBe('neutral');
    expect(component.breakerTone('CLOSED')).toBe('success');
    expect(component.breakerTone('HALF_OPEN')).toBe('warning');
    expect(component.breakerTone('OPEN')).toBe('danger');
    expect(component.breakerTone('UNKNOWN')).toBe('neutral');
  });

  it('renders health and breaker state as text chips, not colour alone', async () => {
    await setup();
    const chips = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.supplier-chip__label'),
    ).map(n => n.textContent?.trim());

    expect(chips).toContain('POSITIVITY.HEALTH.STATUS.HEALTHY');
    expect(chips).toContain('POSITIVITY.HEALTH.BREAKER.OPEN');
    expect(chips).toContain('POSITIVITY.HEALTH.STATUS.NOT_CONFIGURED');
  });

  it('exposes no breaker reset, trip or retry control — the tab is read-only', async () => {
    await setup();
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).map(b => (b.textContent ?? '').toUpperCase());

    expect(labels.some(l => l.includes('RESET'))).toBe(false);
    expect(labels.some(l => l.includes('TRIP'))).toBe(false);
    expect(labels.some(l => l.includes('REPLAY'))).toBe(false);
    expect(labels.every(l => l.includes('REFRESH') || l.includes('RETRY'))).toBe(true);
  });

  it('uses the oldest sample as the panel as-of value', async () => {
    await setup();

    expect(component.oldestObservedAt()).toBe('2026-08-12T09:01:00Z');
  });

  it('uses the tightest backend-delivered threshold and ignores zero', async () => {
    await setup();

    expect(component.stalenessThresholdMinutes()).toBe(60);
  });

  it('falls back to a disabled staleness check when no threshold is delivered', async () => {
    await setup([{ ...healthEntries[2] }]);

    expect(component.stalenessThresholdMinutes()).toBe(0);
  });

  it('records the client fetch time separately from the backend observation time', async () => {
    await setup();

    expect(component.fetchedAt()).not.toBeNull();
    expect(component.fetchedAt()).not.toBe(component.oldestObservedAt());
  });

  it('marks an unconfigured capability row as disabled rather than omitting it', async () => {
    await setup();
    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    );

    expect(rows).toHaveLength(3);
    expect(rows.filter(r => r.getAttribute('aria-disabled') === 'true')).toHaveLength(1);
  });

  it('reloads on demand', async () => {
    await setup();
    component.reload();

    expect(service.getHealth).toHaveBeenCalledTimes(2);
  });
});

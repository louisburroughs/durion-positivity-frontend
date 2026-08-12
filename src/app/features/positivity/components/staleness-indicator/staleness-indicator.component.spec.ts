import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { StalenessIndicatorComponent } from './staleness-indicator.component';

const NOW = Date.parse('2026-08-12T12:00:00Z');

describe('StalenessIndicatorComponent', () => {
  let fixture: ComponentFixture<StalenessIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StalenessIndicatorComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(StalenessIndicatorComponent);
  });

  function render(inputs: Record<string, unknown>): HTMLElement {
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the vendor as-of value and the fetch time as two separately labelled facts', () => {
    const el = render({
      asOf: '2026-08-10',
      asOfLabelKey: 'POSITIVITY.PRICAT.FRESHNESS.EFFECTIVE_DATE',
      fetchedAt: '2026-08-12T11:30:00Z',
      thresholdMinutes: 0,
      nowMs: NOW,
    });

    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n =>
      n.textContent?.trim(),
    );
    expect(terms).toEqual([
      'POSITIVITY.PRICAT.FRESHNESS.EFFECTIVE_DATE',
      'POSITIVITY.FRESHNESS.FETCHED_AT',
    ]);

    const values = el.querySelectorAll('.staleness__value');
    expect(values).toHaveLength(2);
    expect(values[0].textContent?.trim()).not.toBe(values[1].textContent?.trim());
  });

  it('formats a vendor date-only value in local time without shifting a day (ADR-0038)', () => {
    render({ asOf: '2026-08-10', fetchedAt: null, nowMs: NOW });

    expect(fixture.componentInstance.asOfDisplay()).toBe('2026-08-10T00:00:00');
    expect(fixture.componentInstance.asOfFormat()).toBe('mediumDate');
    const value = fixture.nativeElement.querySelectorAll('.staleness__value')[0];
    expect(value.textContent).toContain('10');
  });

  it('formats an instant as-of value with the medium (date + time) format', () => {
    render({ asOf: '2026-08-12T09:00:00Z', nowMs: NOW });

    expect(fixture.componentInstance.asOfFormat()).toBe('medium');
    expect(fixture.componentInstance.asOfDisplay()).toBe('2026-08-12T09:00:00Z');
  });

  it('marks data stale when the vendor as-of value is past the backend threshold', () => {
    const el = render({
      asOf: '2026-08-12T09:00:00Z',
      fetchedAt: '2026-08-12T11:59:00Z',
      thresholdMinutes: 120,
      nowMs: NOW,
    });

    expect(fixture.componentInstance.stale()).toBe(true);
    expect(fixture.componentInstance.freshnessLabelKey()).toBe('POSITIVITY.FRESHNESS.STALE');
    expect(fixture.componentInstance.freshnessTone()).toBe('warning');
    expect(el.querySelector('.staleness__note')).not.toBeNull();
  });

  it('a recent fetch of old data is still stale — fetch time never masks currency', () => {
    render({
      asOf: '2026-08-01T09:00:00Z',
      fetchedAt: '2026-08-12T11:59:59Z',
      thresholdMinutes: 60,
      nowMs: NOW,
    });

    expect(fixture.componentInstance.stale()).toBe(true);
  });

  it('marks data current while inside the backend threshold', () => {
    const el = render({
      asOf: '2026-08-12T11:30:00Z',
      fetchedAt: '2026-08-12T11:31:00Z',
      thresholdMinutes: 120,
      nowMs: NOW,
    });

    expect(fixture.componentInstance.stale()).toBe(false);
    expect(fixture.componentInstance.freshnessLabelKey()).toBe('POSITIVITY.FRESHNESS.CURRENT');
    expect(el.querySelector('.staleness__note')).toBeNull();
  });

  it('reports unknown — not fresh, not stale — when there is no vendor timestamp', () => {
    render({ asOf: null, fetchedAt: '2026-08-12T11:59:00Z', thresholdMinutes: 60, nowMs: NOW });

    expect(fixture.componentInstance.hasAsOf()).toBe(false);
    expect(fixture.componentInstance.stale()).toBe(false);
    expect(fixture.componentInstance.freshnessLabelKey()).toBe('POSITIVITY.FRESHNESS.UNKNOWN');
    expect(fixture.componentInstance.freshnessTone()).toBe('neutral');
  });

  it('states explicitly when the vendor timestamp or the fetch is missing', () => {
    const el = render({ asOf: null, fetchedAt: null, nowMs: NOW });
    const values = Array.from(el.querySelectorAll('.staleness__value')).map(n =>
      n.textContent?.trim(),
    );

    expect(values[0]).toBe('POSITIVITY.FRESHNESS.NO_VENDOR_TIMESTAMP');
    expect(values[1]).toBe('POSITIVITY.FRESHNESS.NEVER_FETCHED');
  });

  it('never treats data as stale when the backend threshold is zero', () => {
    render({ asOf: '2020-01-01T00:00:00Z', thresholdMinutes: 0, nowMs: NOW });

    expect(fixture.componentInstance.stale()).toBe(false);
  });

  it('exposes the status through a text chip, not colour alone', () => {
    const el = render({ asOf: '2026-08-12T09:00:00Z', thresholdMinutes: 60, nowMs: NOW });
    const chipLabel = el.querySelector('.supplier-chip__label');

    expect(chipLabel?.textContent?.trim()).toBe('POSITIVITY.FRESHNESS.STALE');
  });
});

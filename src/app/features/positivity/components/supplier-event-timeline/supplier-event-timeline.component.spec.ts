/**
 * Shared append-only timeline (issues #191, #193).
 *
 * ADR-0029: list semantics + real <time> elements; status is text + glyph, never
 * colour alone.
 * ADR-0032: fixtures typed as their exact interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SupplierEventTimelineComponent,
  SupplierTimelineEntry,
} from './supplier-event-timeline.component';

const entries: SupplierTimelineEntry[] = [
  {
    id: 'ev-1',
    occurredAt: '2026-08-10T09:00:00Z',
    labelKey: 'POSITIVITY.TRANSMISSION.STATE.SENT',
    icon: 'send',
    details: [{ termKey: 'POSITIVITY.TRANSMISSION.HISTORY.VENDOR_STATUS', value: 'RECEIVED' }],
  },
  {
    id: 'ev-2',
    occurredAt: '2026-08-11T09:00:00Z',
    labelText: 'VENDOR_SPECIFIC_CODE',
    icon: 'help',
    details: [],
  },
  {
    id: 'ev-3',
    occurredAt: '2026-08-12T09:00:00Z',
    labelKey: 'POSITIVITY.TRANSMISSION.STATE.CONFIRMED',
    icon: 'check_circle',
    details: [],
  },
];

describe('SupplierEventTimelineComponent', () => {
  let fixture: ComponentFixture<SupplierEventTimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierEventTimelineComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierEventTimelineComponent);
  });

  function render(list: readonly SupplierTimelineEntry[]): HTMLElement {
    fixture.componentRef.setInput('entries', list);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders an ordered list with one item per entry', () => {
    const el = render(entries);

    expect(el.querySelectorAll('ol.pos-timeline')).toHaveLength(1);
    expect(el.querySelectorAll('li.pos-timeline__item')).toHaveLength(3);
  });

  it('preserves the caller order exactly — nothing is re-sorted here', () => {
    const el = render(entries);

    const times = Array.from(el.querySelectorAll('time')).map(n => n.getAttribute('datetime'));
    expect(times).toEqual([
      '2026-08-10T09:00:00Z',
      '2026-08-11T09:00:00Z',
      '2026-08-12T09:00:00Z',
    ]);
  });

  it('renders each timestamp as a real <time datetime> element', () => {
    const el = render(entries);

    const time = el.querySelector('time');
    expect(time).not.toBeNull();
    expect(time?.getAttribute('datetime')).toBe('2026-08-10T09:00:00Z');
    expect(time?.textContent?.trim()).not.toBe('');
  });

  it('carries status as translated text, with the glyph hidden from assistive tech', () => {
    const el = render(entries);

    const label = el.querySelector('.pos-timeline__label');
    expect(label?.textContent?.trim()).toBe('POSITIVITY.TRANSMISSION.STATE.SENT');

    const markers = Array.from(el.querySelectorAll('.pos-timeline__marker'));
    expect(markers).toHaveLength(3);
    expect(markers.every(m => m.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('shows an unrecognised vendor code verbatim rather than hiding the entry', () => {
    const el = render(entries);

    const labels = Array.from(el.querySelectorAll('.pos-timeline__label')).map(n =>
      n.textContent?.trim(),
    );
    expect(labels).toContain('VENDOR_SPECIFIC_CODE');
  });

  it('offers no control that could mutate, dismiss or reorder an entry', () => {
    const el = render(entries);

    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(el.querySelectorAll('input')).toHaveLength(0);
    expect(el.querySelectorAll('select')).toHaveLength(0);
    expect(el.querySelectorAll('[contenteditable]')).toHaveLength(0);
  });

  it('renders labelled details as a definition list', () => {
    const el = render(entries);

    expect(el.querySelector('.pos-timeline__term')?.textContent?.trim()).toBe(
      'POSITIVITY.TRANSMISSION.HISTORY.VENDOR_STATUS',
    );
    expect(el.querySelector('.pos-timeline__value')?.textContent?.trim()).toBe('RECEIVED');
  });

  it('renders a second time fact as its own <time> element, not as an ISO string', () => {
    const el = render([
      {
        id: 'ev-x',
        occurredAt: '2026-08-10T09:00:00Z',
        labelKey: 'POSITIVITY.SHIPMENT.EVENT.SHIPPED',
        icon: 'local_shipping',
        details: [
          {
            termKey: 'POSITIVITY.SHIPMENT.RECEIVED_AT',
            value: '2026-08-10T09:05:00Z',
            datetime: '2026-08-10T09:05:00Z',
          },
        ],
      },
    ]);

    const times = Array.from(el.querySelectorAll('time')).map(n => n.getAttribute('datetime'));
    expect(times).toEqual(['2026-08-10T09:00:00Z', '2026-08-10T09:05:00Z']);
    expect(el.querySelector('.pos-timeline__value')?.textContent).not.toContain('2026-08-10T09:05');
  });

  it('renders a translated empty message instead of an empty list', () => {
    const el = render([]);

    expect(el.querySelector('ol.pos-timeline')).toBeNull();
    expect(el.querySelector('.pos-timeline__empty')?.textContent?.trim()).toBe(
      'POSITIVITY.TIMELINE.EMPTY',
    );
  });
});

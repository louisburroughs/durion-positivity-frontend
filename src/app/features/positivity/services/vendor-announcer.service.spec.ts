import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VendorAnnouncerService } from './vendor-announcer.service';

describe('VendorAnnouncerService', () => {
  let service: VendorAnnouncerService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(VendorAnnouncerService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    vi.useRealTimers();
  });

  const region = () => document.body.querySelector<HTMLElement>('[data-testid="vendor-announcer"]');

  it('keeps one polite status region on the body, outside every route outlet', () => {
    service.announce('Vendor V-000123 added.');
    service.announce('Vendor V-000124 added.');

    const regions = document.body.querySelectorAll('[data-testid="vendor-announcer"]');
    expect(regions).toHaveLength(1);
    expect(region()?.getAttribute('role')).toBe('status');
    expect(region()?.getAttribute('aria-live')).toBe('polite');
    expect(region()?.parentElement).toBe(document.body);
  });

  it('writes the text after a short delay, and only the latest announcement', () => {
    service.announce('first');
    service.announce('second');
    expect(region()?.textContent).toBe('');

    vi.advanceTimersByTime(100);
    expect(region()?.textContent).toBe('second');
  });

  it('removes its region when destroyed', () => {
    service.announce('x');
    service.ngOnDestroy();
    expect(region()).toBeNull();
  });
});

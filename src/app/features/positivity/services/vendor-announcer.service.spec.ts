import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { VendorAuthStub } from '../vendors.spec-helper';
import { ANNOUNCE_CLEAR_MS, VendorAnnouncerService } from './vendor-announcer.service';

describe('VendorAnnouncerService', () => {
  let service: VendorAnnouncerService;
  let auth: VendorAuthStub;

  beforeEach(() => {
    vi.useFakeTimers();
    auth = new VendorAuthStub();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
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

  it('clears the text a few seconds later (review A4)', () => {
    service.announce('Vendor V-000123 added.');
    vi.advanceTimersByTime(100);
    expect(region()?.textContent).toBe('Vendor V-000123 added.');

    vi.advanceTimersByTime(ANNOUNCE_CLEAR_MS - 1);
    expect(region()?.textContent).toBe('Vendor V-000123 added.');
    vi.advanceTimersByTime(1);
    expect(region()?.textContent).toBe('');
  });

  it('an earlier announcement’s clear timer never empties a later one (ADR-0063 §6)', () => {
    service.announce('first');
    vi.advanceTimersByTime(100 + ANNOUNCE_CLEAR_MS - 50);
    service.announce('second');
    vi.advanceTimersByTime(100);
    expect(region()?.textContent).toBe('second');
    vi.advanceTimersByTime(100);
    expect(region()?.textContent).toBe('second');
  });

  it('clears on a tid|sub change, including an announcement still pending', () => {
    service.announce('Vendor V-000123 added.');
    vi.advanceTimersByTime(100);
    auth.claims.set({ sub: 'someone.else' });
    TestBed.tick();
    expect(region()?.textContent).toBe('');

    service.announce('pending');
    auth.tenant.set('tenant-2');
    TestBed.tick();
    vi.advanceTimersByTime(100);
    expect(region()?.textContent).toBe('');
  });

  it('removes its region when destroyed', () => {
    service.announce('x');
    service.ngOnDestroy();
    expect(region()).toBeNull();
  });
});

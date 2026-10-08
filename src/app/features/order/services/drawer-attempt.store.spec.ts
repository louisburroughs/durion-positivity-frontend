import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { PendingAttempt } from '../models/register-drawer.models';
import { DrawerAttemptStore } from './drawer-attempt.store';

const SESSION = '018f2a6e-0000-7000-8000-00000000a001';
const OTHER_SESSION = '018f2a6e-0000-7000-8000-00000000a002';

function setup(): { store: DrawerAttemptStore; who: ReturnType<typeof signal<{ tid: string; sub: string }>> } {
  const who = signal({ tid: 'tenant-1', sub: 'cashier-1' });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: { tenantId: () => who().tid, currentUserClaims: () => ({ sub: who().sub }) },
      },
    ],
  });
  return { store: TestBed.inject(DrawerAttemptStore), who };
}

function attempt(store: DrawerAttemptStore, overrides: Partial<PendingAttempt> = {}): PendingAttempt {
  return {
    requestId: '018f2a6e-0000-7000-8000-00000000r001',
    draft: { reason: 'BANK_DROP', amount: 300, currencyCode: 'CAD', bagNumber: 'BAG-7' },
    kind: 'PAY_OUT',
    sessionId: SESSION,
    identity: store.identity(),
    ...overrides,
  };
}

describe('DrawerAttemptStore (CAP:550 S22, item 6 amendment)', () => {
  it('identity() is tid|sub, percent-encoded', () => {
    const { store, who } = setup();
    expect(store.identity()).toBe('tenant-1|cashier-1');
    who.set({ tid: 'a|b', sub: 'c' });
    expect(store.identity()).toBe('a%7Cb|c');
  });

  it('hold() keeps an attempt for the scoped session and pendingFor() returns it there only', () => {
    const { store } = setup();
    store.scopeTo(SESSION);
    const held = attempt(store);
    store.hold(held);

    expect(store.pendingFor(SESSION)).toEqual(held);
    expect(store.pendingFor(OTHER_SESSION)).toBeNull();
    expect(store.pendingFor(null)).toBeNull();
  });

  it('hold() refuses an attempt for another session or another cashier', () => {
    const { store } = setup();
    store.scopeTo(SESSION);
    store.hold(attempt(store, { sessionId: OTHER_SESSION }));
    expect(store.pendingFor(OTHER_SESSION)).toBeNull();
    store.hold(attempt(store, { identity: 'tenant-1|cashier-2' }));
    expect(store.pendingFor(SESSION)).toBeNull();
  });

  it('release() settles only the matching requestId', () => {
    const { store } = setup();
    store.scopeTo(SESSION);
    store.hold(attempt(store));
    store.release('another-id');
    expect(store.pendingFor(SESSION)).not.toBeNull();
    store.release('018f2a6e-0000-7000-8000-00000000r001');
    expect(store.pendingFor(SESSION)).toBeNull();
  });

  it('scopeTo() drops an attempt when the session changes or none is open', () => {
    const { store } = setup();
    store.scopeTo(SESSION);
    store.hold(attempt(store));
    store.scopeTo(SESSION);
    expect(store.pendingFor(SESSION)).not.toBeNull();
    store.scopeTo(OTHER_SESSION);
    store.scopeTo(SESSION);
    expect(store.pendingFor(SESSION)).toBeNull();

    store.hold(attempt(store));
    store.scopeTo(null);
    store.scopeTo(SESSION);
    expect(store.pendingFor(SESSION)).toBeNull();
  });

  it('never returns an attempt to another cashier, and scopeTo() then drops it', () => {
    const { store, who } = setup();
    store.scopeTo(SESSION);
    store.hold(attempt(store));
    who.set({ tid: 'tenant-1', sub: 'cashier-2' });
    expect(store.pendingFor(SESSION)).toBeNull();
    store.scopeTo(SESSION);
    who.set({ tid: 'tenant-1', sub: 'cashier-1' });
    expect(store.pendingFor(SESSION)).toBeNull();
  });

  it('clear() drops everything', () => {
    const { store } = setup();
    store.scopeTo(SESSION);
    store.hold(attempt(store));
    store.clear();
    expect(store.pendingFor(SESSION)).toBeNull();
  });
});

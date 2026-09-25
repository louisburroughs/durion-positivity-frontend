import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BulkImportCorrectionReloader } from './bulk-import-correction-reloader';

describe('BulkImportCorrectionReloader', () => {
  it('adds the record to pendingIds immediately and only removes it once the reload settles', () => {
    const pendingIds = signal<Set<string>>(new Set());
    const reloader = new BulkImportCorrectionReloader(pendingIds);
    const submit$ = new Subject<void>();
    const reload$ = new Subject<number>();
    let applied: number | undefined;

    reloader.run('rec-1', submit$, {
      reload$,
      onReloadSuccess: result => { applied = result; },
      onSubmitError: () => { /* not reached */ },
    }).subscribe();

    expect(pendingIds().has('rec-1')).toBe(true);

    submit$.next(undefined);
    submit$.complete();
    expect(pendingIds().has('rec-1')).toBe(true);
    expect(applied).toBeUndefined();

    reload$.next(42);
    reload$.complete();
    expect(pendingIds().has('rec-1')).toBe(false);
    expect(applied).toBe(42);
  });

  it('releases pending and invokes onSubmitError without reloading when the submit itself fails', () => {
    const pendingIds = signal<Set<string>>(new Set());
    const reloader = new BulkImportCorrectionReloader(pendingIds);
    let reloadInvoked = false;
    let caught: unknown;

    reloader.run('rec-1', throwError(() => new Error('rejected')), {
      reload$: of(1).pipe(),
      onReloadSuccess: () => { reloadInvoked = true; },
      onSubmitError: err => { caught = err; },
    }).subscribe();

    expect(pendingIds().has('rec-1')).toBe(false);
    expect(reloadInvoked).toBe(false);
    expect(caught).toBeInstanceOf(Error);
  });

  it('settles pending on a reload failure and invokes onReloadError', () => {
    const pendingIds = signal<Set<string>>(new Set());
    const reloader = new BulkImportCorrectionReloader(pendingIds);
    let errored = false;

    reloader.run('rec-1', of(undefined), {
      reload$: throwError(() => new Error('reload failed')),
      onReloadSuccess: () => { /* not reached */ },
      onReloadError: () => { errored = true; },
      onSubmitError: () => { /* not reached */ },
    }).subscribe();

    expect(pendingIds().has('rec-1')).toBe(false);
    expect(errored).toBe(true);
  });

  it('ignores a stale reload result once a newer reload has been issued, but still releases its pending id', () => {
    const pendingIds = signal<Set<string>>(new Set());
    const reloader = new BulkImportCorrectionReloader(pendingIds);
    const reloadA$ = new Subject<string>();
    const reloadB$ = new Subject<string>();
    const applied: string[] = [];

    reloader.run('rec-A', of(undefined), {
      reload$: reloadA$,
      onReloadSuccess: r => applied.push(r),
      onSubmitError: () => { /* not reached */ },
    }).subscribe();

    reloader.run('rec-B', of(undefined), {
      reload$: reloadB$,
      onReloadSuccess: r => applied.push(r),
      onSubmitError: () => { /* not reached */ },
    }).subscribe();

    // The newer reload (B) lands first and is applied.
    reloadB$.next('b-result');
    reloadB$.complete();
    expect(applied).toEqual(['b-result']);
    expect(pendingIds().has('rec-B')).toBe(false);

    // The stale reload (A) lands late: never applied, but still releases rec-A.
    reloadA$.next('a-result');
    reloadA$.complete();
    expect(applied).toEqual(['b-result']);
    expect(pendingIds().has('rec-A')).toBe(false);
  });

  it('splices the submit result via onSubmitResult and skips the reload when it returns false (durion-positivity-backend#2205)', () => {
    const pendingIds = signal<Set<string>>(new Set());
    const reloader = new BulkImportCorrectionReloader(pendingIds);
    let reloadInvoked = false;
    let spliced: { recordId: string } | undefined;

    reloader.run('rec-1', of({ recordId: 'rec-1' }), {
      reload$: of(undefined),
      onReloadSuccess: () => { reloadInvoked = true; },
      onSubmitError: () => { /* not reached */ },
      onSubmitResult: result => { spliced = result; return false; },
    }).subscribe();

    expect(spliced).toEqual({ recordId: 'rec-1' });
    expect(reloadInvoked).toBe(false);
    expect(pendingIds().has('rec-1')).toBe(false);
  });

  it('falls back to the reload when onSubmitResult returns true (fields were null)', () => {
    const pendingIds = signal<Set<string>>(new Set());
    const reloader = new BulkImportCorrectionReloader(pendingIds);
    let reloaded: number | undefined;

    reloader.run('rec-1', of(null), {
      reload$: of(42),
      onReloadSuccess: result => { reloaded = result; },
      onSubmitError: () => { /* not reached */ },
      onSubmitResult: result => result === null,
    }).subscribe();

    expect(reloaded).toBe(42);
    expect(pendingIds().has('rec-1')).toBe(false);
  });

  it('onSubmitError is mandatory at the type level, so a REJECTED correction can never vanish silently (Copilot #4105840870)', () => {
    const pendingIds = signal<Set<string>>(new Set());
    const reloader = new BulkImportCorrectionReloader(pendingIds);
    let caught: unknown;

    // Not subscribed: this closure only proves the type-level enforcement below, never runs.
    // @ts-expect-error onSubmitError is required — a caller omitting it must fail to compile.
    const missingHandler = () => reloader.run('rec-1', throwError(() => new Error('rejected')), {
      reload$: of(1),
      onReloadSuccess: () => { /* not reached */ },
    });
    expect(missingHandler).toBeDefined();

    reloader.run('rec-2', throwError(() => new Error('rejected')), {
      reload$: of(1),
      onReloadSuccess: () => { /* not reached */ },
      onSubmitError: err => { caught = err; },
    }).subscribe();

    expect(caught).toBeInstanceOf(Error);
    expect(pendingIds().has('rec-2')).toBe(false);
  });
});

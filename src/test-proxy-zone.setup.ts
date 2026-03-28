import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import 'zone.js/testing';

const zoneApi = (globalThis as unknown as { Zone?: Record<string, unknown> }).Zone as
  | (Record<string, unknown> & { current?: unknown; root?: unknown })
  | undefined;

if (zoneApi) {
  const proxyZoneSpecCtor = zoneApi['ProxyZoneSpec'] as
    | (new () => {
      getDelegate?: () => unknown;
      setDelegate?: (delegate: unknown) => void;
      resetDelegate?: () => void;
    })
    | undefined;

  if (proxyZoneSpecCtor && typeof zoneApi.current === 'object' && zoneApi.current !== null) {
    const zoneCurrent = zoneApi.current as { fork?: (spec: unknown) => { run: <T>(fn: () => T) => T } };
    const proxyZoneSpec = new proxyZoneSpecCtor();
    const proxyZone = zoneCurrent.fork?.(proxyZoneSpec);

    const wrap = <TArgs extends unknown[], TResult>(
      fn: ((...args: TArgs) => TResult) | undefined,
    ): ((...args: TArgs) => TResult) | undefined => {
      if (!fn || !proxyZone) {
        return fn;
      }

      return function wrapped(this: unknown, ...args: TArgs): TResult {
        return proxyZone.run(() => fn.apply(this, args));
      };
    };

    const patchHook = (name: 'it' | 'test' | 'beforeEach' | 'afterEach' | 'beforeAll' | 'afterAll'): void => {
      const globalRecord = globalThis as unknown as Record<string, unknown>;
      const original = globalRecord[name] as ((titleOrFn: unknown, maybeFn?: unknown, timeout?: unknown) => unknown) | undefined;

      if (!original || (original as { __proxyZonePatched?: boolean }).__proxyZonePatched) {
        return;
      }

      const patched = function patchedFn(
        this: unknown,
        titleOrFn: unknown,
        maybeFn?: unknown,
        timeout?: unknown,
      ): unknown {
        if (typeof titleOrFn === 'function') {
          return original.call(this, wrap(titleOrFn as (...args: never[]) => unknown));
        }

        if (typeof maybeFn === 'function') {
          return original.call(
            this,
            titleOrFn,
            wrap(maybeFn as (...args: never[]) => unknown),
            timeout,
          );
        }

        return original.call(this, titleOrFn, maybeFn, timeout);
      } as typeof original & { __proxyZonePatched?: boolean };

      patched.__proxyZonePatched = true;
      globalRecord[name] = patched;
    };

    patchHook('it');
    patchHook('test');
    patchHook('beforeEach');
    patchHook('afterEach');
    patchHook('beforeAll');
    patchHook('afterAll');

    beforeAll(() => {
      proxyZoneSpec.resetDelegate?.();
    });

    beforeEach(() => {
      proxyZoneSpec.resetDelegate?.();
    });

    afterEach(() => {
      proxyZoneSpec.resetDelegate?.();
    });

    afterAll(() => {
      proxyZoneSpec.resetDelegate?.();
    });
  }
}

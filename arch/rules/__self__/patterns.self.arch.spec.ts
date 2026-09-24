import {
  pat01Finder,
  pat02Finder,
  pat03Finder,
  pat04Finder,
  pat05Finder,
  pat06Finder,
  pat07Finder,
  pat08Finder,
} from '../patterns.rules';

/**
 * Self-tests for PAT-01..08 (plan §6). Every finder here is pure content (no filesystem access),
 * so each is called directly with inline `{ path, content }` sources — violating and
 * compliant/false-positive shapes side by side, per fixture file.
 */
const P = 'src/app/features/fxpat/pages/fxpat-page/fxpat-page.component.ts';

describe('[self] PAT-01 an effect( callback that calls .subscribe( must declare onCleanup and call it', () => {
  it('flags a subscribing effect with no onCleanup and leaves a compliant one alone', () => {
    const violating = pat01Finder({
      path: P,
      content: `
        class FxpatPage {
          constructor() {
            effect(() => {
              this.svc.load().subscribe(v => this.value.set(v));
            });
          }
        }
      `,
    });
    expect(violating).toEqual(['constructor :: effect subscribes without registering onCleanup']);

    const compliant = pat01Finder({
      path: P,
      content: `
        class FxpatPage {
          constructor() {
            effect(onCleanup => {
              const sub = this.svc.load().subscribe(v => this.value.set(v));
              onCleanup(() => sub.unsubscribe());
            });
          }
        }
      `,
    });
    expect(compliant).toEqual([]);
  });

  it('does not fire on an effect with no .subscribe( at all', () => {
    const noSubscribe = pat01Finder({
      path: P,
      content: `
        class FxpatPage {
          constructor() {
            effect(() => {
              this.value.set(this.other());
            });
          }
        }
      `,
    });
    expect(noSubscribe).toEqual([]);
  });
});

describe('[self] PAT-02 no takeUntilDestroyed inside an effect( callback', () => {
  it('flags takeUntilDestroyed used inside effect( and leaves it alone outside effect(', () => {
    const violating = pat02Finder({
      path: P,
      content: `
        class FxpatPage {
          constructor() {
            effect(onCleanup => {
              const sub = this.svc.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
              onCleanup(() => sub.unsubscribe());
            });
          }
        }
      `,
    });
    expect(violating).toEqual(['constructor :: takeUntilDestroyed inside effect(']);

    const compliant = pat02Finder({
      path: P,
      content: `
        class FxpatPage {
          load(): void {
            this.svc.load().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
          }
        }
      `,
    });
    expect(compliant).toEqual([]);
  });
});

describe("[self] PAT-03 errorKey.set(<non-null>) is immediately preceded by state.set('error')", () => {
  const withStateSignal = (body: string): string => `
    class FxpatPage {
      readonly state = signal('idle');
      readonly errorKey = signal(null);
      load(): void {
        this.svc.load().subscribe({
          next: v => this.value.set(v),
          error: () => {
            ${body}
          },
        });
      }
    }
  `;

  it('flags errorKey.set with no preceding state.set at all', () => {
    const findings = pat03Finder({ path: P, content: withStateSignal("this.errorKey.set('FXPAT.ERROR');") });
    expect(findings).toEqual(['load :: errorKey.set not immediately preceded by state.set(\'error\')']);
  });

  it("flags errorKey.set preceded by state.set with a value other than 'error'", () => {
    const findings = pat03Finder({ path: P, content: withStateSignal("this.state.set('idle');\n            this.errorKey.set('FXPAT.ERROR');") });
    expect(findings.length).toBe(1);
  });

  it("is compliant when state.set('error') immediately precedes errorKey.set(...)", () => {
    const findings = pat03Finder({ path: P, content: withStateSignal("this.state.set('error');\n            this.errorKey.set('FXPAT.ERROR');") });
    expect(findings).toEqual([]);
  });

  it('§11.4: is compliant with a computed forbidden/error ternary', () => {
    const findings = pat03Finder({
      path: P,
      content: withStateSignal("this.state.set(err?.status === 403 ? 'forbidden' : 'error');\n            this.errorKey.set('FXPAT.ERROR');"),
    });
    expect(findings).toEqual([]);
  });

  it('is compliant with an exhaustive if/else-if/else state.set chain (generalised ternary, real supplier-fleet-panel shape)', () => {
    const findings = pat03Finder({
      path: P,
      content: withStateSignal(
        [
          "if (outcome.kind === 'forbidden') {",
          "  this.state.set('forbidden');",
          "} else if (outcome.kind === 'retryable') {",
          "  this.state.set('unreachable');",
          '} else {',
          "  this.state.set('error');",
          '}',
          'this.errorKey.set(outcome.errorKey);',
        ].join('\n            '),
      ),
    });
    expect(findings).toEqual([]);
  });

  it("is a false positive guard: does not fire when the class has no 'state' signal at all (a form-level errorKey, real location-edit-page shape)", () => {
    const findings = pat03Finder({
      path: P,
      content: `
        class FxpatPage {
          readonly loading = signal(false);
          readonly errorKey = signal(null);
          submit(): void {
            this.svc.save().subscribe({
              next: () => this.loading.set(false),
              error: () => {
                this.errorKey.set('FXPAT.ERROR.SAVE');
                this.loading.set(false);
              },
            });
          }
        }
      `,
    });
    expect(findings).toEqual([]);
  });

  it('ignores errorKey.set(null) — clearing is not the rule this checks', () => {
    const findings = pat03Finder({ path: P, content: withStateSignal('this.errorKey.set(null);') });
    expect(findings).toEqual([]);
  });
});

describe('[self] PAT-04 catchError( in features/**/services/** must not return an empty-value fallback', () => {
  it('flags of([]), of(new Map()), of(new Set()), of({}) and EMPTY, and leaves a real fallback alone', () => {
    const shapes: [string, string][] = [
      ['of([])', 'of([])'],
      ['of(new Map())', 'of(new Map())'],
      ['of(new Set())', 'of(new Set())'],
      ['of({})', 'of({})'],
      ['EMPTY', 'EMPTY'],
    ];
    for (const [label, expr] of shapes) {
      const findings = pat04Finder({
        path: 'src/app/features/fxpat/services/fxpat.service.ts',
        content: `class FxpatService { load() { return this.http.get().pipe(catchError(() => ${expr})); } }`,
      });
      expect(findings, label).toEqual(['load :: catchError returns ' + label]);
    }

    const compliant = pat04Finder({
      path: 'src/app/features/fxpat/services/fxpat.service.ts',
      content: `class FxpatService { load() { return this.http.get().pipe(catchError(err => throwError(() => err))); } }`,
    });
    expect(compliant).toEqual([]);
  });

  it('does not cross into a nested function when looking for the return', () => {
    const findings = pat04Finder({
      path: 'src/app/features/fxpat/services/fxpat.service.ts',
      content: `
        class FxpatService {
          load() {
            return this.http.get().pipe(
              catchError(() => {
                const fallback = () => of([]); // a nested helper, not the catchError's own return
                return throwError(() => new Error('x'));
              }),
            );
          }
        }
      `,
    });
    expect(findings).toEqual([]);
  });
});

describe('[self] PAT-05 no UTC-unsafe date shapes', () => {
  it("flags new Date('YYYY-MM-DD') and leaves a full ISO timestamp alone", () => {
    const violating = pat05Finder({ path: P, content: "const d = new Date('2026-08-12');" });
    expect(violating).toEqual(["top-level :: new Date('2026-08-12') date-only literal parses as UTC"]);

    const compliant = pat05Finder({ path: P, content: "const d = new Date('2026-08-12T00:00:00-07:00');" });
    expect(compliant).toEqual([]);
  });

  it('flags toISOString().slice(0, 10) and leaves an unrelated slice(0, 10) alone', () => {
    const violating = pat05Finder({ path: P, content: 'todayIso(): string { return new Date().toISOString().slice(0, 10); }' });
    expect(violating.some((f) => f.includes('toISOString'))).toBe(true);

    const compliant = pat05Finder({ path: P, content: "const head = someArray.slice(0, 10);" });
    expect(compliant).toEqual([]);
  });

  it('flags the 86400000 and 24*60*60*1000 ms-per-day literals', () => {
    expect(pat05Finder({ path: P, content: 'const msPerDay = 86400000;' }).length).toBe(1);
    expect(pat05Finder({ path: P, content: 'const msPerDay = 86_400_000;' }).length).toBe(1);
    expect(pat05Finder({ path: P, content: 'const msPerDay = 24 * 60 * 60 * 1000;' }).length).toBe(1);
  });

  it("flags a class field 'today = new Date()' and leaves a local variable alone", () => {
    const violating = pat05Finder({ path: P, content: 'class FxpatPage { today = new Date(); }' });
    expect(violating.some((f) => f.includes("today = new Date()"))).toBe(true);

    const compliant = pat05Finder({ path: P, content: 'function f() { const today = new Date(); return today; }' });
    expect(compliant).toEqual([]);
  });
});

describe("[self] PAT-06 (warn, spec project) no literal-date new Date('20YY-…') in a spec", () => {
  it('flags a literal-year Date and leaves a computed one alone', () => {
    const violating = pat06Finder({ path: 'src/app/features/fxpat/fxpat.service.spec.ts', content: "const d = new Date('2026-01-01');" });
    expect(violating).toEqual(["top-level :: new Date('2026-01-01') literal date"]);

    const compliant = pat06Finder({ path: 'src/app/features/fxpat/fxpat.service.spec.ts', content: 'const d = new Date();' });
    expect(compliant).toEqual([]);
  });
});

describe('[self] PAT-07 no parameter default that reads a live signal in an apply* method', () => {
  it('flags this.signal() as a default and leaves a plain default alone', () => {
    const violating = pat07Finder({
      path: P,
      content: 'class FxpatPage { applyFilter(key = this.requestKey()): void {} }',
    });
    expect(violating).toEqual(["applyFilter(key = this.requestKey()) reads a live signal as a parameter default"]);

    const compliant = pat07Finder({
      path: P,
      content: "class FxpatPage { applyFilter(key = 'default'): void {} }",
    });
    expect(compliant).toEqual([]);
  });

  it('does not fire on a non-apply* method', () => {
    const findings = pat07Finder({ path: P, content: 'class FxpatPage { updateFilter(key = this.requestKey()): void {} }' });
    expect(findings).toEqual([]);
  });
});

describe('[self] PAT-08 no console.* in production code, except an allowlisted logger location', () => {
  it('flags console.error/warn/log; two calls in the same method produce the same finding text (the rule-level uniqSorted collapses them to one baseline key, per plan §11.4 "several identical findings collapse to one key")', () => {
    const findings = pat08Finder({
      path: P,
      content: `
        class FxpatPage {
          handle(): void {
            console.error('one');
            console.error('two');
          }
        }
      `,
    });
    expect(findings).toEqual(['handle :: console.error(...)', 'handle :: console.error(...)']);
    expect(new Set(findings).size).toBe(1); // what actually survives to a baseline key
  });

  it('does not fire on an unrelated console-shaped identifier', () => {
    const findings = pat08Finder({ path: P, content: "const myConsole = { error: () => {} }; myConsole.error('x');" });
    expect(findings).toEqual([]);
  });
});

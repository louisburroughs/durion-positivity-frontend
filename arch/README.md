# Architecture suite

Executable architecture rules built on [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS)
(`archunit`, pinned exactly). The rule catalog, the ADR behind each rule and the rollout history live
in [`docs/PLAN-archunit-architecture-tests.md`](../docs/PLAN-archunit-architecture-tests.md).

```bash
npm run test:arch                               # the whole suite (also runs inside `npm test`)
npx vitest run --config arch/vitest.arch.config.ts arch/rules/transport   # one file
ARCH_BASELINE_PRUNE=1 npm run test:arch         # delete baseline entries that no longer occur
```

It runs in plain-node Vitest, never under `ng test`: ArchUnitTS reads the filesystem.

## Layout

| Path | Holds |
| --- | --- |
| `support/projects.ts` | The programs rules run against (`APP`, `SPEC`, `FIXTURES`) and **every selector**, as regexes |
| `support/rule.ts` | Rule factories: `dependencyRule`, `cycleRule`, `contentRule`, `templateRule`, `customRule`, `combine` |
| `support/ast.ts` | TypeScript-AST queries for content rules (imports, literals, calls, `enclosing`); comments never match |
| `support/templates.ts` | Angular template parsing for `*.html` rules |
| `support/baseline.ts` | `verify()` / `archTest()` and the shrink-only ratchet |
| `support/violation-key.ts` | The one adapter from ArchUnitTS violations to stable baseline keys |
| `rules/<suite>.rules.ts` | Rule factories, one per rule ID |
| `rules/<suite>.arch.spec.ts` | Runs each rule against `src` |
| `rules/__self__/` | Self-tests: every rule fires on a planted violation and ignores known false-positive shapes |
| `fixtures/` | A mini `src/app` tree with planted violations, for dependency-rule self-tests |
| `baselines/<ID>.json` | Today's accepted debt for Ratchet rules |

## Reading a failure

Each test is titled `[ID] rule text (ADR reference)`. A failure lists:

- `+ <key>` — a **new** violation. Fix the code.
- `- <key>` — a **stale** baseline entry: the debt was paid. Delete the entry (or run with
  `ARCH_BASELINE_PRUNE=1`) in the same PR.

Keys are `source -> target` for dependencies, `cycle :: a , b` for cycles, and `path :: finding`
for content and template rules. Keys never contain line numbers.

## Modes

- **Enforce** — zero violations, no baseline file. A baseline file for an Enforce rule is an error.
- **Ratchet** — debt recorded in `baselines/<ID>.json`; the file may only shrink. A Ratchet rule
  with no debt fails, telling you to promote it to Enforce.
- **Warn** — prints findings, never fails. For SHOULD-level ADR text.

## Baselines are not an escape hatch

There is no "record" mode. Adding an entry is a hand edit with a mandatory `reason` (and a
`tracking` issue), reviewed as a diff. Adding one to make the suite pass is listed under Common
Mistakes in `AGENTS.md`. If a violation is genuinely intended, change the rule and its self-test.

## Adding a rule

1. Add a factory `(p: Project) => ArchRule` to the suite's `*.rules.ts`. Build selectors in
   `support/projects.ts` as regexes: ArchUnitTS globs with an interior `**` silently under-match.
2. Content rules parse with `support/ast.ts`, never regex over raw source.
3. Register it in the suite's `*.arch.spec.ts` with `archTest(rule(APP))`.
4. Add self-tests in `rules/__self__/`: at least one violating shape that fires and the known
   false-positive shapes that must not. Fixture files under `fixtures/` use distinctive names and
   are asserted with `toContain` / `not.toContain`, never exact equality.
5. Measure it on `src`. Zero → Enforce. Non-zero → fix it, or Ratchet with a reasoned baseline.

## ESLint mirrors

Three rules are mirrored in `eslint.config.js` for in-editor feedback: **SDK-01**
(`no-restricted-imports` of `HttpClient`/`HttpBackend`), **SEC-01** and **SEC-03**
(`no-restricted-syntax`). The suite is authoritative; keep the mirrors in sync when a rule changes.

## Guards on the tool itself

`rules/__self__/harness.self.arch.spec.ts` asserts that ArchUnitTS (which bundles its own
TypeScript 5.9) sees every file the repo's TypeScript 6 compiles, and that each selector matches the
same file count as the filesystem. If either fails, rules would be silently under-covering.

## Reports

`rules/reports.arch.spec.ts` writes non-gating trend data to `reports/arch/` (git-ignored; uploaded
by CI as the `arch-reports` artifact): the feature dependency graph (`features.mmd`), size and LCOM
metrics, and `baseline-summary.json`, the debt burndown.

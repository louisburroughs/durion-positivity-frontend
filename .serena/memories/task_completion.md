# Task completion checklist

Before considering frontend work complete in this repo:

1. Run the relevant tests, usually `npx ng test --no-watch` or a narrower `npx ng test --include=... --no-watch` target for touched areas.
2. Run `npx ng lint` when code changes could affect lint rules.
3. Run `npm run i18n:check` when adding or modifying translation keys.
4. Run `npm run a11y:smoke` for UI changes that affect rendered routes or accessibility flows.
5. Check AGENTS.md ADR rules for any touched area, especially error-state ordering, cleanup in effects, i18n, navigation, service tests, and date handling.
6. If you changed build/runtime behavior, also use `npm run build`.

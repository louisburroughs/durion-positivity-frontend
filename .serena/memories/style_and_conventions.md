# Style and conventions

- Formatting: .editorconfig enforces UTF-8, spaces, 2-space indentation, final newline, trimmed trailing whitespace; TypeScript prefers single quotes. package.json embeds Prettier with `printWidth: 100` and `singleQuote: true`.
- Angular style: standalone components only, no NgModules. Components declare imports explicitly.
- State management: Angular Signals are the default reactive pattern. Routed pages use `state` and `errorKey` signals.
- Error handling: when setting an error key, set `state` to `'error'` first.
- HTTP: feature services should use `ApiBaseService`, not direct `HttpClient` injection.
- Observable cleanup: use `takeUntilDestroyed(this.destroyRef)` outside `effect()` bodies and `onCleanup(() => sub.unsubscribe())` inside `effect()` bodies.
- i18n: all user-facing strings must use `TranslatePipe`, and new keys must be added to all locale files.
- Testing: typed fixtures matching exact interfaces, co-located service specs, and tests for every public service method.
- Navigation: in-app links use `routerLink`; retry/reload actions use buttons, not anchors.
- Date-only handling: do not use `new Date(YYYY-MM-DD)` for local-date semantics; convert with split year/month/day logic or append `T00:00:00` before DatePipe usage when appropriate.
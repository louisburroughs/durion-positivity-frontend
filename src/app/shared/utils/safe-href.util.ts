/**
 * URL scheme validation (ADR-0065 §2, SEC-07).
 *
 * This is the single place in the app that declares a scheme allowlist for a
 * value bound to an `href`. `shell/utils/markdown.util.ts` (chat link/image
 * rendering) and `safeMailtoHref` below both build on `normaliseHref`/`isSafeHref`
 * rather than re-declaring their own regex, so SEC-07 stays enforceable as "one
 * file owns this decision".
 */

/** Schemes an anchor may carry. Anything else renders as inert text. */
const SAFE_SCHEME_RE = /^(?:https?:|mailto:)/i;
/** A scheme-looking prefix, used to tell `javascript:x` from a bare relative path. */
const ANY_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
/**
 * `//host/path` and `\\host\path` carry no scheme but still resolve to another
 * origin, so a scheme check alone would wave them through.
 */
const ORIGIN_RELATIVE_RE = /^[/\\]{2}/;

/**
 * Browsers strip ASCII whitespace and control characters out of a URL before
 * resolving it, so `java\tscript:alert(1)` runs as `javascript:`. Validate — and
 * render — what the browser will actually see, never the raw source.
 */
export function normaliseHref(href: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return href.replace(/[\u0000- \u007f]/g, '');
}

/**
 * True when `href` may be used as an anchor target: an http(s)/mailto URL, or a
 * path relative to this app that carries no scheme and no other origin.
 * Everything else — `javascript:`, `data:`, `vbscript:`, `//evil.example` — is
 * rejected. Call it on the value returned by {@link normaliseHref}.
 */
export function isSafeHref(href: string): boolean {
  const candidate = normaliseHref(href);
  if (candidate.length === 0) return false;
  if (ORIGIN_RELATIVE_RE.test(candidate)) return false;
  if (SAFE_SCHEME_RE.test(candidate)) return true;
  return !hasUrlScheme(candidate);
}

/**
 * True when the (already-normalised) candidate starts with a URL scheme, e.g.
 * `javascript:` or `data:`. Exposed for callers — such as `isFetchableHref` in
 * `markdown.util.ts` — that need to tell a schemed URL from a relative path
 * without re-declaring the scheme-shape regex themselves.
 */
export function hasUrlScheme(candidate: string): boolean {
  return ANY_SCHEME_RE.test(candidate);
}

/**
 * A conservative address shape for building a `mailto:` target. Excludes whitespace and
 * control characters, the RFC separators that could smuggle a second recipient, `?`/`&`
 * which would open mailto header injection (`a@b?bcc=...`), and `%`.
 *
 * `%` matters on its own: without it `a@b.com%0d%0abcc=attacker%40evil.example` satisfies
 * every other rule here and passes the scheme allowlist, and a mail client decodes the
 * escapes back into CRLF plus a header — the injection this shape exists to stop. A real
 * address never needs a percent sign once quoted local parts are already excluded.
 */
const EMAIL_RE =
  // eslint-disable-next-line no-control-regex -- excluding control characters is the point
  /^[^\s@,;:<>"'()[\]\\?&%\u0000-\u001f\u007f]+@[^\s@,;:<>"'()[\]\\?&%\u0000-\u001f\u007f]+\.[A-Za-z]{2,}$/;

/**
 * ADR-0065 §2: an address that reached us from the server is shape-checked, normalised and
 * validated before it is bound to an `href`. Returns null when it cannot be trusted; the
 * caller then renders the address as plain text rather than a link, never omitting it.
 *
 * Shared by the employee register and the people directory (#306) so the next hardening
 * lands in both at once. pos-people-contact stores addresses trimmed but otherwise
 * unvalidated, so this is the only check between the directory and a live link.
 */
export function safeMailtoHref(email: string | null | undefined): string | null {
  if (!email || !EMAIL_RE.test(email)) return null;
  const href = normaliseHref(`mailto:${email}`);
  return isSafeHref(href) ? href : null;
}

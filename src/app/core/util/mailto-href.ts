import { isSafeHref, normaliseHref } from '../../features/shell/util/markdown.util';

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

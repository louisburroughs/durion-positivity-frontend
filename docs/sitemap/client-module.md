# Site-map client module — consumer spec (for `pos-mcp-server`)

This is the reference specification for the client module that `pos-mcp-server`
implements to consume the frontend's [`/sitemap.json`](./README.md) artifact.
It lives in the frontend repo so both sides reference the **same contract and
the same example payload**; the implementation itself lives in `pos-mcp-server`.

The client module is a **pull-only consumer**: it fetches the artifact over
HTTP, validates it, caches it, and exposes the parsed sections to the rest of
the server. It must not import frontend code or types — the only shared contract
is [`sitemap.schema.json`](./sitemap.schema.json).

## Responsibilities

1. **Fetch** `GET ${FRONTEND_BASE_URL}/sitemap.json` (no auth header).
2. **Validate** the response against the contract (status, content type,
   `application`, `version`).
3. **Cache** the parsed result with a TTL, keeping a **last-known-good** copy.
4. **Expose** the parsed sections (and helpers) to callers.
5. **Degrade gracefully** — a frontend outage or an unrecognized future version
   must not crash the server.

## Configuration

| Setting | Required | Default | Notes |
|---------|----------|---------|-------|
| `FRONTEND_BASE_URL` | yes | — | Origin of the frontend SSR server (not the API gateway). The SSR server listens on `PORT`, default `4000`. |
| `SITEMAP_CACHE_TTL` | no | `600s` | How long a fetched copy is served before a refresh is attempted. |
| `SITEMAP_FETCH_TIMEOUT` | no | `5s` | Per-request HTTP timeout. |
| `SITEMAP_EXPECTED_VERSION` | no | `1` | Contract version this build was written against. |

Do **not** hardcode the host. `/sitemap.json` is served by the frontend itself,
ahead of any auth, so send **no** `Authorization` header.

## Interface (language-agnostic)

```
interface SiteMapSection {
  route: string          // canonical in-app route, e.g. "/app/crm"
  titleKey: string       // i18n key
  title: string          // resolved en-US text
  descriptionKey: string
  description: string
  roles?: string[]       // absent => all authenticated users
  group: "main" | "admin"
  order: number          // sort order within group
}

interface SiteMap {
  application: string    // "durion-positivity-frontend"
  version: number
  generatedAt: string    // ISO-8601
  sections: SiteMapSection[]   // ordered by (group, order): main before admin
}

interface SiteMapClient {
  // Returns cached data if fresh; otherwise fetches, validates, caches.
  // On fetch failure, returns last-known-good and logs a warning.
  getSiteMap(): SiteMap

  // Sections the given roles can reach (a section with no `roles` is open to
  // any authenticated user; otherwise the user must hold >=1 listed role).
  visibleSections(userRoles: string[]): SiteMapSection[]

  // Force a refresh regardless of TTL (e.g. an admin "reload" action).
  refresh(): SiteMap
}
```

## Fetch + validation rules

1. Treat any non-`200` status, a non-JSON `Content-Type`, or a body that fails
   to parse as a **fetch failure** → serve last-known-good, log a warning. If
   there is no cached copy yet, surface a clear "site map unavailable" error to
   the caller rather than a raw parse exception.
2. Reject (as a fetch failure) any payload where
   `application !== "durion-positivity-frontend"`.
3. **Version handling:**
   - `version === SITEMAP_EXPECTED_VERSION` → normal.
   - `version > SITEMAP_EXPECTED_VERSION` → **tolerate**: parse only known
     fields, ignore unknown ones, log an info/warning. Newer versions may add
     fields; this must not crash.
   - `version < SITEMAP_EXPECTED_VERSION` → log a warning; still usable.
4. `generatedAt` is **not** a stability key — it changes every frontend build.
   Use it only for change-detection/telemetry, never as a cache key that would
   force a refetch on every poll.
5. Preserve the artifact's `(group, order)` ordering; do not re-sort in a way
   that diverges from the rendered page.

## Caching & freshness

- Serve the cached copy until `SITEMAP_CACHE_TTL` elapses, then refresh on the
  next access (or via a background timer).
- On refresh failure, **keep** the previous copy and extend its lifetime rather
  than dropping to empty.
- Alternative acceptable strategy: fetch once at startup/deploy and cache in
  memory for the process lifetime, refreshing only on explicit `refresh()`.
- The frontend sends `Cache-Control: no-cache`, so there is no CDN/proxy layer
  to invalidate — the client owns its own freshness policy.

## Reference test spec

The client module's test suite MUST cover the following cases. Use the
[example payload](#example-payload) below as the canonical fixture.

| # | Case | Expectation |
|---|------|-------------|
| 1 | Happy path — 200 + valid body | `getSiteMap()` returns parsed `SiteMap` with all sections in `(group, order)` order |
| 2 | `visibleSections([])` (no roles) | returns only sections without a `roles` array |
| 3 | `visibleSections(["ROLE_ADMIN"])` | includes admin-gated sections (e.g. `/app/admin`) |
| 4 | Section role match is "any of" | a section requiring `["ROLE_A","ROLE_B"]` is visible to a user holding just `ROLE_B` |
| 5 | HTTP 500 / timeout with a warm cache | returns last-known-good; logs a warning; does not throw |
| 6 | HTTP failure with a cold cache | surfaces a clear "unavailable" error, not a raw parse/HTTP exception |
| 7 | Non-JSON or malformed body | treated as a fetch failure (case 5/6 behavior) |
| 8 | Wrong `application` value | rejected as a fetch failure |
| 9 | `version` higher than expected | parses known fields, ignores unknown ones, does not throw |
| 10 | TTL not elapsed | second call returns cached copy without a second HTTP request |
| 11 | `refresh()` | performs an HTTP request even within TTL |
| 12 | Unknown extra field on a section | ignored, not fatal (forward-compat) |

## Example payload

This is the same fixture used in [`README.md`](./README.md); keep the two in
sync. Conforms to [`sitemap.schema.json`](./sitemap.schema.json).

```json
{
  "application": "durion-positivity-frontend",
  "version": 1,
  "generatedAt": "2026-07-27T00:00:00.000Z",
  "sections": [
    {
      "route": "/app/crm",
      "titleKey": "SHELL.NAV.CRM",
      "title": "Customers",
      "descriptionKey": "SITEMAP.SECTIONS.CRM.DESC",
      "description": "Manage customers, contacts, and relationships.",
      "group": "main",
      "order": 3
    },
    {
      "route": "/app/admin",
      "titleKey": "SHELL.NAV.ADMIN",
      "title": "Admin",
      "descriptionKey": "SITEMAP.SECTIONS.ADMIN.DESC",
      "description": "System administration and configuration.",
      "roles": ["ROLE_ADMIN"],
      "group": "admin",
      "order": 12
    }
  ]
}
```

## Reference fetch (pseudocode)

Adapt to `pos-mcp-server`'s language/HTTP stack; the logic is the contract, not
the syntax.

```
function loadSiteMap(config, cache):
    if cache.fresh(config.ttl):
        return cache.value

    try:
        res = httpGet(config.baseUrl + "/sitemap.json",
                      timeout = config.fetchTimeout)   // no auth header
        assert res.status == 200
        assert res.contentType startsWith "application/json"
        body = parseJson(res.body)
        assert body.application == "durion-positivity-frontend"
        if body.version > config.expectedVersion:
            log.warn("sitemap version {} > expected {}, tolerating",
                     body.version, config.expectedVersion)
        siteMap = mapKnownFields(body)   // ignore unknown fields
        cache.set(siteMap)
        return siteMap
    catch err:
        log.warn("sitemap fetch failed: {}", err)
        if cache.hasValue:
            cache.extend(config.ttl)     // keep last-known-good
            return cache.value
        throw SiteMapUnavailable(err)
```

## Decoupling constraints (must hold)

- **Pull only.** Never import frontend source/types; never have the frontend
  push to `pos-mcp-server`. The frontend already calls `pos-mcp-server` for
  chat — a dependency the other way would be circular.
- **Contract = schema + version.** The shared artifact shape is governed by
  `sitemap.schema.json` and the integer `version`. Changes are additive within
  a version; breaking changes bump `version` (and this spec).
- **No hard runtime dependency.** `pos-mcp-server` must remain functional (via
  last-known-good or a cold-start error path) when the frontend is briefly
  unreachable.

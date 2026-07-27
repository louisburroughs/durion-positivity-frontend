# Site Map — human index + machine-readable contract

The site map is the application's index of navigable sections. It is published
in two forms from **one source of truth**:

| Consumer | Form | Location |
|----------|------|----------|
| Humans | Angular page | `/app/sitemap` (linked from the shell footer) |
| `pos-mcp-server` (backend) | JSON artifact | `/sitemap.json` (served static) |

## Sources of truth

Two inputs, each owned by exactly one place:

1. **`src/app/features/sitemap/site-map.data.json`** — the curated top-level
   **sections** (translated titles, descriptions, grouping, order, roles).
2. **The Angular route tree** (`app.routes.ts` + feature `*.routes.ts`) — every
   reachable **page**. `scripts/sitemap/extract-routes.mjs` parses it with the
   TypeScript compiler (no Angular runtime, no eager component imports) to
   recover full paths, roles, and dynamic-`:param` flags.

Both consumers read from these same two sources, so they cannot drift:

- The Angular `SitemapPageComponent` renders the curated sections and, under
  each, its directly-navigable child pages from the generated route manifest
  (`site-map.routes.generated.ts`). Dynamic `:param` routes are omitted from the
  human page (they need an entity id).
- `scripts/sitemap/generate-sitemap.mjs` merges both sources and emits the
  public `sitemap.json` artifact, attaching **all** reachable routes (including
  dynamic ones as patterns) to their section as `pages[]`.

`site-map.routes.generated.ts` is committed (like the msIcon glyph map) so the
app and its tests always have it; `npm run sitemap:routes:check` fails CI if it
drifts from the routes.

## Why this is decoupled (no circular dependency)

The frontend already depends on `pos-mcp-server` at runtime (the shell chat
calls `/mcp-server/v1/mcp/chat` via the API gateway). If `pos-mcp-server`
imported frontend code — or the frontend fetched the site map *from* the MCP
server to render it — that would close the loop into a circular dependency.

This design avoids that:

- **One direction, code-wise:** neither repository imports the other. The only
  shared thing is the JSON **schema** in this directory (`sitemap.schema.json`),
  a versioned data contract — not shared code.
- **Pull, not push:** `pos-mcp-server` reads `/sitemap.json` read-only. It can
  fetch it lazily/cached at runtime, or bake it in at its own deploy time, so
  there is no synchronous startup coupling on the frontend being live.
- **Frontend-owned structural metadata:** the site map describes the frontend's
  own route/section structure. It never needs data *from* the backend to be
  produced, so the dependency arrow only ever points backend → artifact.

```
site-map.data.json (sections) ─┐
                               ├─▶ SitemapPageComponent  (humans, /app/sitemap)
app.routes + *.routes.ts ──────┤     (static pages only)
   │  extract-routes.mjs        │
   ├─▶ site-map.routes.generated.ts ─┘
   │
   └─▶ generate-sitemap.mjs ──▶ /sitemap.json (redacted: non-privileged pages) ──▶ pos-mcp-server (pull, read-only)
```

## The artifact (`/sitemap.json`)

- Generated on `npm start` and `npm run build` (see the `sitemap:generate`
  script). It is **not committed** — it is a build output (git-ignored).
- Served with `Cache-Control: no-cache` by the SSR server (`src/server.ts`) so
  consumers never hold a stale index across a deployment.
- **Served unauthenticated, so it is redacted.** `generate-sitemap.mjs` strips
  the privileged surface from the published artifact: role-gated sections
  (`security`, `admin`) are dropped, role-gated pages (e.g.
  `people/identity-compliance`) are dropped, and no `roles` fields are emitted.
  The result is an invariant — **every route in the artifact is reachable by any
  authenticated user**, so anonymous callers can't enumerate the admin/security
  surface. The in-app manifest (`site-map.routes.generated.ts`) keeps the full,
  role-aware tree; the auth-gated `/app/sitemap` page filters it per user, so
  admins still see their pages there.
- Conforms to [`sitemap.schema.json`](./sitemap.schema.json). Bump `version`
  in `site-map.data.json` and the schema together on any breaking shape change.
- Consumer guidance: [`client-module.md`](./client-module.md) specifies how
  `pos-mcp-server` should fetch, validate, cache, and expose the artifact.

### Example (v2)

```json
{
  "application": "durion-positivity-frontend",
  "version": 2,
  "generatedAt": "2026-07-27T00:00:00.000Z",
  "sections": [
    {
      "route": "/app/crm",
      "titleKey": "SHELL.NAV.CRM",
      "title": "Customers",
      "descriptionKey": "SITEMAP.SECTIONS.CRM.DESC",
      "description": "Manage customers, contacts, and relationships.",
      "group": "main",
      "order": 3,
      "pages": [
        { "route": "/app/crm/customers", "label": "Customers", "dynamic": false },
        {
          "route": "/app/crm/party/:partyId",
          "label": "Party",
          "dynamic": true,
          "params": ["partyId"]
        }
      ]
    },
    {
      "route": "/app/bulk-import",
      "title": "Bulk Import",
      "group": "other",
      "order": 900,
      "pages": [
        { "route": "/app/bulk-import/jobs", "label": "Jobs", "dynamic": false }
      ]
    }
  ]
}
```

`other`-group sections are top-level route segments with no curated metadata
(e.g. `bulk-import`, `order`); they carry a derived `title` and no i18n keys.

## Adding or changing content

- **New page under an existing section** — just add the route in the feature's
  `*.routes.ts`. It flows into `sitemap.json` (and the human page, if static)
  automatically on the next build; regenerate locally with
  `npm run sitemap:routes:generate && npm run sitemap:generate`.
- **New top-level section** (nicer title/description/grouping than the derived
  `other` default) — add an entry to `site-map.data.json` (`route`, `titleKey`,
  `descriptionKey`, optional `roles`, `group`, `order`), add the
  `SITEMAP.SECTIONS.<NAME>.DESC` key to every locale under `src/assets/i18n/`,
  run `npm run i18n:pseudo:generate`, and reuse an existing `SHELL.NAV.*` key for
  `titleKey` where possible.

> Page labels on the human sitemap are derived from route segments and are **not
> localized**. If a page needs a translated label, promote it to a curated entry
> (future enhancement — see `client-module.md` follow-ups).

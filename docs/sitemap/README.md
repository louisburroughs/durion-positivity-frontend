# Site Map — human index + machine-readable contract

The site map is the application's index of navigable sections. It is published
in two forms from **one source of truth**:

| Consumer | Form | Location |
|----------|------|----------|
| Humans | Angular page | `/app/sitemap` (linked from the shell footer) |
| `pos-mcp-server` (backend) | JSON artifact | `/sitemap.json` (served static) |

## Single source of truth

Everything derives from **`src/app/features/sitemap/site-map.data.json`**:

- The Angular `SitemapPageComponent` imports it and renders a role-filtered,
  grouped list of `routerLink`s.
- `scripts/sitemap/generate-sitemap.mjs` reads it (plus `en-US.json` to resolve
  i18n keys to text) and emits the public `sitemap.json` artifact.

Because both renderers read the same file, the human page and the backend
contract cannot drift.

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
site-map.data.json ──▶ SitemapPageComponent   (humans, /app/sitemap)
        │
        └────────────▶ generate-sitemap.mjs ──▶ /sitemap.json ──▶ pos-mcp-server (pull, read-only)
```

## The artifact (`/sitemap.json`)

- Generated on `npm start` and `npm run build` (see the `sitemap:generate`
  script). It is **not committed** — it is a build output (git-ignored).
- Served with `Cache-Control: no-cache` by the SSR server (`src/server.ts`) so
  consumers never hold a stale index across a deployment.
- Conforms to [`sitemap.schema.json`](./sitemap.schema.json). Bump `version`
  in `site-map.data.json` and the schema together on any breaking shape change.

### Example

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

## Adding or changing a section

Edit `site-map.data.json` only:

1. Add the entry (`route`, `titleKey`, `descriptionKey`, optional `roles`,
   `group`, `order`).
2. Add the `SITEMAP.SECTIONS.<NAME>.DESC` key to every locale under
   `src/assets/i18n/`, then run `npm run i18n:pseudo:generate`.
3. Reuse an existing `SHELL.NAV.*` key for `titleKey` where possible.

The page and the `sitemap.json` artifact both update automatically.

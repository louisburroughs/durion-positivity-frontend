---
title: "PRD: Multi-Stage Capability Crawl for Durion Positivity Frontend"
owner: "louisburroughs/durion-positivity-frontend"
status: "draft"
last_updated: "2026-03-25"
---

# Product Requirements Document — Multi-Stage Capability Crawl for Durion Positivity Frontend

## 1. Objective

Define the execution plan for building the Durion Positivity Angular frontend by crawling every capability under `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/CAP-*` until all frontend-relevant capabilities are either:

- implemented in the Angular application,
- explicitly blocked with a recorded reason, or
- normalized into an execution-ready state for the next build wave.

This PRD extends and operationalizes:
- `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/PRD-agent-capability-frontend-execution.md`

Canonical tracking artifact for this program:
- `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/CAPABILITY_STATUS_BOARD.md`

## 2. Core Principles

### Terminology Convention

Use `workorder` for technical identifiers and contracts (for example `workorderId`, API paths, DTO fields, route params, and internal symbols). Use `work order` for user-facing copy (labels, helper text, toasts, and documentation prose intended for operators).

### Capability-Driven Execution

Each frontend story must be implemented by following the capability workflow inputs in this order:
1. `frontend_story_md`
2. `wireframe`
3. `contract_guide`
4. SDK/OpenAPI inspection for `operation_ids`

### Crawl Until Completion

The build does not stop after a single wave. The orchestrator must continuously re-scan all `CAP-*` folders and move each capability through one of three lanes:

- `execute-now`: workset is complete enough for implementation
- `normalize-first`: manifest/workset metadata is incomplete and must be repaired
- `blocked`: capability cannot proceed because a dependency or human decision is missing

### Domain-First Angular Architecture

Angular must be organized by domain. Each domain is implemented as a separate feature area in the Angular project, rooted by its own domain component and route configuration.

Target pattern:

```text
src/app/features/
  auth/
  shell/
  accounting/
  crm/
  people/
  inventory/
  workexec/
  location/
  product/
  order/
  billing/
  security/
```

Each domain should own:
- `<domain>.routes.ts`
- a root `<domain>.component.ts`
- domain pages/components
- domain services/adapters
- domain models/view-models

Shared concerns remain in:
- `src/app/core/`
- `src/app/features/shell/`

### Design Hierarchy

Design guidance precedence for implementation is:
1. Primary: `/home/louis-burroughs/IdeaProjects/durion-positivity-frontend/design/DESIGN.md`
2. Primary visual references: files under `/home/louis-burroughs/IdeaProjects/durion-positivity-frontend/design/`
3. Secondary guidance: `/home/louis-burroughs/IdeaProjects/durion-positivity-frontend/design/source/`
4. Secondary assets: fonts and images under `/home/louis-burroughs/IdeaProjects/durion-positivity-frontend/design/source/fonts` and `/home/louis-burroughs/IdeaProjects/durion-positivity-frontend/design/source/images`

HTML pages in `design/` are reference only. They may inform layout and flow, but they do not define requirements.

## 3. Current Inventory Snapshot

As of `2026-03-25`, the capability crawl found:

- 58 total capability folders under `docs/capabilities/CAP-*`
- 19 capabilities with non-empty `AGENT_WORKSET.yaml` story lists
- 69 current frontend story entries across those executable worksets
- 38 declared `operation_ids`
- 52 stories with empty `operation_ids` that require contract review or workset completion
- 6 stories with missing wireframe references

This means the delivery plan must support both implementation and metadata normalization in parallel.
Current and ongoing status/count tracking must be updated in:
- `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/CAPABILITY_STATUS_BOARD.md`

## 4. Domain Rollout Map

### Foundation Domains

- `shell`: app chrome, executive dashboard, navigation, shared layout, cross-domain entry points
- `auth`: login experience and public entry flows
- `security`: token handling, session state, auth integration

Primary design inputs:
- `design/DESIGN.md`
- `design/ExecutiveDashboard.png`
- `design/source/durion-style-guide.md`
- `design/source/theme-tokens.md`

Primary capability inputs:
- `CAP-275`

### Customer and CRM Domain

- Angular domain: `crm`
- Design pack: `design/Customer/`
- Primary capability group: `CAP-089`, `CAP-090`, `CAP-091`, `CAP-092`, `CAP-094`, `CAP-252`
- Deferred/normalization candidates: none currently

### Work Execution Domain

- Angular domain: `workexec`
- Design pack: `design/Shop-Workorder/`
- Primary capability group: `CAP-002`, `CAP-003`, `CAP-004`, `CAP-005`, `CAP-006`, `CAP-007`, `CAP-137`, `CAP-139`, `CAP-142`, `CAP-249`

### Accounting and Billing Domain

- Angular domains: `accounting`, `billing`
- Design pack: `design/Accounting/`
- Primary capability group: `CAP-049`, `CAP-050`, `CAP-051`, `CAP-052`, `CAP-053`, `CAP-054`, `CAP-055`, `CAP-250`, `CAP-251`, `CAP-278`

### People and Location Domain

- Angular domains: `people`, `location`
- Design pack: `design/HR/`
- Primary capability group: `CAP-117`, `CAP-118`, `CAP-119`, `CAP-120`, `CAP-121`, `CAP-136`, `CAP-214`

### Inventory and Product Domains

- Angular domains: `inventory`, `product`
- Design pack: `design/Inventory-Catalog/`
- Primary capability group: `CAP-165`, `CAP-166`, `CAP-167`, `CAP-168`, `CAP-170`, `CAP-215`, `CAP-216`, `CAP-217`, `CAP-218`, `CAP-219`, `CAP-220`, `CAP-221`, `CAP-247`, `CAP-315`

### Orders Domain

- Angular domain: `order`
- Design pack: cross-reference `design/Shop-Workorder/` and `design/Inventory-Catalog/`
- Primary capability group: `CAP-246`

### Unmapped or Metadata-Incomplete Capability Queue

No frontend capabilities are currently unmapped or metadata-incomplete.
Tracking reference: `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/CAPABILITY_STATUS_BOARD.md`
Note: `CAP-278` is backend-only for the current frontend program scope.

## 5. Multi-Stage Execution Plan

### Stage 0 — Program Setup

Establish the execution framework before domain feature delivery begins:

- confirm Angular route registration pattern under `/app`
- confirm root token strategy in `src/styles.css`
- register a standard domain folder template for all feature areas
- define capability run artifact locations and naming
- use `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/CAPABILITY_STATUS_BOARD.md` as the canonical capability status board with `queued`, `normalizing`, `ready`, `in-build`, `in-review`, `blocked`, `done`

### Stage 1 — Capability Normalization Crawl

For every `CAP-*` folder:

1. load `CAPABILITY_MANIFEST.yaml`
2. load `AGENT_WORKSET.yaml`
3. classify the capability:
   - `ready` if stories, story markdown, wireframe or approved design fallback, contract guide, and usable contract inputs exist
   - `normalizing` if metadata is partial but reparable
   - `blocked` if a true dependency is missing
4. record missing items:
   - empty story lists
   - missing story markdown
   - missing wireframes
   - empty `operation_ids`
   - ambiguous or empty domain assignment

Outputs:
- refreshed capability inventory
- prioritized normalization backlog
- first executable build wave
- synchronized updates to `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/CAPABILITY_STATUS_BOARD.md`

### Stage 2 — Frontend Foundation Build

Implement or stabilize the shared Angular platform used by every domain:

- shell layout
- dashboard landing experience
- navigation model
- auth/session plumbing
- HTTP/client abstractions
- domain route registration conventions
- theme tokens, fonts, and shared UI primitives aligned to the design hierarchy

This stage should complete before large-scale domain parallelization.

### Stage 3 — Domain Build Waves

Execute domain delivery in waves so that teams can build in parallel with limited overlap.

Wave A:
- `security`
- `auth`
- `shell`
- `crm`

Wave B:
- `workexec`
- `accounting`
- `billing`

Wave C:
- `people`
- `location`
- `inventory`
- `product`
- `order`

Each domain wave must:
- pull executable capabilities for that domain
- implement stories in domain-owned Angular components
- register routes and navigation entries
- wire contract-backed service calls
- preserve design fidelity to the primary design resources

### Stage 4 — Continuous Re-Crawl

After each wave:

1. re-scan all `CAP-*` directories
2. move newly-complete worksets into `ready`
3. re-queue previously blocked capabilities if dependencies are cleared
4. update the domain backlog and next-wave assignments

This stage repeats until no frontend-relevant capability remains unclassified.

### Stage 5 — Integration and Hardening

For each completed domain:

- verify route integration with the shell
- verify auth and role guard behavior
- verify API error handling and loading states
- verify responsive behavior for primary screens
- verify design token usage and font/image asset loading
- run build and test validation

### Stage 6 — Completion and Closeout

A capability is closed only when:

- all stories in its workset are implemented or explicitly blocked
- domain routes/components are integrated into Angular
- required contract calls are wired
- run artifacts are updated
- validation results are recorded

The overall PRD program is complete only when every frontend-relevant capability is either:
- `done`, or
- `blocked` with a clear external dependency or decision owner

## 6. Capability Processing Algorithm

For each capability selected for execution:

1. Read `CAPABILITY_MANIFEST.yaml`.
2. Read `AGENT_WORKSET.yaml`.
3. Validate:
   - domain assignment exists
   - `frontend_story_md` exists
   - `contract_guide` exists
   - `wireframe` exists, or approved design pack fallback is documented
   - `operation_ids` is populated, or story is marked contract-review-required
4. Load story context in the sequence defined by the workflow PRD.
5. Map the story to the owning Angular domain component.
6. Implement:
   - route/page
   - presentational components
   - domain service adapters
   - request/response mapping
   - validation, loading, error, and empty states
7. Validate the affected domain.
8. Update run artifacts.
9. Return the capability to the crawl board for post-wave reclassification.

## 7. Angular Implementation Rules

### Domain Ownership

Code must be placed in the domain that owns the business workflow. No cross-domain feature implementation without an explicit contract dependency.

### Feature Structure

Each domain feature should follow this structure:

```text
src/app/features/<domain>/
  <domain>.component.ts
  <domain>.routes.ts
  pages/
  components/
  services/
  models/
```

### Routing

- all protected business routes remain children of `/app`
- each domain is lazy-loaded from `src/app/app.routes.ts`
- shell navigation is updated only when a domain has at least one usable entry route

### Shared UI Rules

- shared primitives belong in shell/shared or core only when reused by multiple domains
- domain-specific widgets stay inside the owning feature

## 8. Design Execution Rules

- Use `/design/DESIGN.md` as the primary design authority.
- Use the matching domain design folder as the primary visual reference pack.
- Use `design/source/durion-style-guide.md`, `design/source/theme-tokens.md`, and `design/source/durion-theme.css` to map tokens, fonts, and brand semantics.
- Use fonts and image assets from `design/source/` rather than inventing replacements.
- Do not treat `.html` files in `design/` as requirement specifications.
- Preserve the Architectural Ledger style:
  - no heavy divider lines
  - tonal separation over boxed layouts
  - editorial scale and asymmetry
  - blueprint blue with restrained teal emphasis

## 9. Run Artifacts and Traceability

For each capability, create or update:

- `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/<CAP-ID>/runs/latest.md`

Each artifact must include:

- capability id
- domain
- stories processed
- files changed
- `operation_ids` implemented
- validation commands executed
- status: `done`, `partial`, or `blocked`
- blockers, assumptions, and follow-ups

Optional history retention:

- `/home/louis-burroughs/IdeaProjects/durion/docs/capabilities/<CAP-ID>/runs/history/<timestamp>.md`

## 10. Validation Gates

At minimum, each affected build wave must run:

- `npm run build`
- domain-targeted unit tests where present
- any route or integration checks added during implementation

If a check fails, the run artifact must capture:
- the failing command
- the reason
- whether the failure blocks release or can be deferred

## 11. Build Team Handoff

After this PRD is approved, the implementation team should be created with at least:

- 1 orchestrator agent for crawl management and sequencing
- 1 normalization agent for incomplete manifests/worksets
- 1 shared-platform agent for shell/auth/design system work
- 1 agent per active domain wave
- 1 verification agent for build/test/run artifact review

Agents must work from this PRD plus the capability workflow PRD, not from HTML references alone.

## 12. Acceptance Criteria

This PRD is successful when it enables an agent team to:

1. crawl every capability folder under `docs/capabilities/CAP-*`
2. classify each capability into execution, normalization, or blocked lanes
3. build Angular features by domain, with each domain represented by its own feature root component and route tree
4. apply the required design precedence and asset usage rules
5. continuously re-crawl the backlog until all frontend-relevant capabilities are closed
6. leave traceable run artifacts for every capability processed

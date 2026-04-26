# PRD: Published Angular SDK Transition

**Status:** Ready for Development  
**Date:** 2026-04-26  
**Owner:** Frontend Platform  
**Related Repos:** `durion-positivity-sdk-angular`, `durion-positivity-frontend`, `durion-positivity-backend`  
**References:** `PRD-sdk-migration-completion.md`, `sdk-migration-analysis.md`

---

## Objective

Move `durion-positivity-frontend` off the current local-pack SDK installation flow and
onto a published private-package workflow for `@durion-sdk/*`.

The target end state is:

- the Angular SDK is published from CI to a private registry
- the frontend declares normal semver dependencies on `@durion-sdk/*`
- `npm ci` is sufficient to install the frontend in local, CI, and Docker builds
- frontend builds no longer clone, pack, or side-load the SDK repository at build time

---

## Why This Is Required

The current migration is functionally using the SDK, but it is not yet operationally
complete. The frontend still relies on a custom installer that packs the SDK repo or
installs prepacked tarballs at build time. That creates several persistent problems:

- lockfiles cannot pin real SDK package versions
- CI and Docker require custom bootstrap logic
- frontend builds depend on sibling-repo layout or an SDK checkout being injected
- SDK provenance is weak because package installation is not tied to a registry release
- consumers cannot distinguish "frontend changed" from "SDK contract changed" in a
  clean, versioned way

This PRD closes that gap. SDK migration is not considered complete until the frontend
consumes published SDK artifacts through a normal package-manager workflow.

---

## Decision

Adopt a **private published SDK** model first.

Rules:

- Publish `@durion-sdk/*` to a private registry, not public npm, during the migration
  and stabilization period.
- Use prerelease versions until contract drift and cast cleanup are complete.
- Publish from CI only.
- Version all published SDK packages together as one release train initially.
- Keep `@durion-sdk/internal` private and unpublished.

### Registry Recommendation

Default recommendation: **GitHub Packages** for the first release phase.

Reasoning:

- the repos already build in GitHub Actions
- authentication and publish automation are simpler to stand up quickly
- it minimizes new infrastructure while the SDK contracts are still changing

Alternative:

- **AWS CodeArtifact** is a valid follow-on if Durion wants centralized AWS-native
  package governance across more internal package families

This plan assumes GitHub Packages unless platform direction explicitly chooses
CodeArtifact before implementation starts.

---

## Non-Goals

- Public open-source SDK publishing
- Independent per-package versioning
- Cross-framework SDK consolidation with `durion-positivity-sdk`
- Eliminating prerelease tags before the contract surface stabilizes
- Replacing the Angular SDK generation pipeline itself

---

## Current State

- `durion-positivity-frontend` installs SDK packages through a custom script that packs
  `durion-positivity-sdk-angular` locally or uses prepacked tarballs
- Docker and CI still inject or clone the SDK checkout during build paths
- SDK packages are structurally close to publishable, but release metadata and publish
  automation are incomplete
- frontend migration quality is still in progress; SDK type drift is documented in
  `sdk-migration-analysis.md`

---

## Target State

### SDK Repository

- root release workflow exists and publishes all eligible `@durion-sdk/*` packages
- package metadata is correct: repository, license, publish config, and access rules
- a single published version maps to one generated contract snapshot
- prerelease and stable channels are clearly separated

### Frontend Repository

- `package.json` declares direct dependencies on the required `@durion-sdk/*` packages
- `package-lock.json` resolves those packages from the chosen private registry
- no SDK checkout, packing, or custom install step is required for `npm ci`
- Docker and CI install from the registry using normal auth

### Operational Controls

- SDK publishing is gated by generate/build/test validation
- frontend changes can intentionally bump SDK versions through normal dependency updates
- rollback is possible by pinning the previous published SDK version

---

## Work Plan

Work is organized into six phases. Phases 0-2 are SDK-release enablement. Phases 3-5
complete frontend adoption and retirement of the temporary local-pack flow.

### Phase 0 — Release Model and Registry Decision

**Goal:** Lock the release and registry model before editing pipelines.

Tasks:

- choose the registry: GitHub Packages by default, CodeArtifact only if platform
  explicitly prefers AWS-native package distribution
- confirm package scope and access model for `@durion-sdk/*`
- define versioning policy:
  - one version for all published Angular SDK packages
  - prerelease sequence such as `0.2.0-alpha.1`, `0.2.0-alpha.2`, ...
- define branch/tag trigger policy for publish workflows

Acceptance criteria:

- [ ] Registry choice is documented
- [ ] Versioning policy is documented
- [ ] Publish trigger policy is documented

### Phase 1 — Make `durion-positivity-sdk-angular` Publishable

**Goal:** Bring the SDK repo to releaseable package quality.

Tasks:

- update root package metadata and release scripts
- correct package metadata in each publishable SDK package:
  - real repository URL
  - correct license
  - `publishConfig`
  - package access
- explicitly mark `@durion-sdk/internal` as non-published/private
- verify generated package outputs expose the correct `exports`, `types`, and Angular
  packaging metadata
- add a release manifest tool or workflow helper for all publishable packages

Acceptance criteria:

- [ ] All publishable packages pass build from a clean checkout
- [ ] Package metadata contains no placeholders
- [ ] `npm pack` succeeds for all publishable packages
- [ ] Internal-only packages are excluded from publication

### Phase 2 — CI Publishing Pipeline

**Goal:** Publish SDK artifacts from CI, never from developer workstations.

Tasks:

- add SDK CI workflow for:
  - OpenAPI generation
  - build
  - test
  - package verification
  - publish on approved trigger
- add registry authentication through repository secrets or OIDC-backed workflow where
  supported
- add prerelease and stable release lanes
- emit release notes or changelog entries with published versions

Acceptance criteria:

- [ ] A prerelease publish can be executed from CI end-to-end
- [ ] Published package versions are installable from a clean external consumer
- [ ] Failed publish jobs do not partially update the consumer dependency state

### Phase 3 — Frontend Dependency Adoption

**Goal:** Move `durion-positivity-frontend` to normal SDK dependencies.

Tasks:

- add required `@durion-sdk/*` packages to frontend `dependencies`
- configure registry auth for local development, CI, and Docker
- replace the custom SDK bootstrap flow with normal package-manager installation
- update lockfile to resolve against the private registry

Acceptance criteria:

- [ ] `npm ci` installs the frontend and SDK from the registry with no local SDK checkout
- [ ] `npm run build` succeeds from a clean checkout with only registry credentials
- [ ] `npm test` and other required workflows no longer depend on `.sdk-src` or
  `.sdk-tarballs`

### Phase 4 — Build and Runtime Path Cleanup

**Goal:** Remove temporary SDK bootstrapping from CI and container build paths.

Tasks:

- remove SDK repo checkout from frontend GitHub workflows
- remove SDK clone/pack logic from the frontend Dockerfile
- remove custom SDK install scripts that only exist to compensate for unpublished
  packages
- simplify failure modes so SDK installation problems surface as normal dependency
  resolution failures

Acceptance criteria:

- [ ] frontend GitHub workflows do not check out the SDK repo
- [ ] Docker build does not clone or repack the SDK repo
- [ ] the frontend has no custom SDK bootstrap path left except optional emergency
  rollback tooling kept outside the standard build

### Phase 5 — Stabilization and Migration Exit

**Goal:** Make published-SDK consumption the required steady-state workflow.

Tasks:

- document the consumer upgrade path for SDK version bumps
- define rollback procedure using version pinning
- confirm the frontend migration PRD completion checklist includes published-SDK
  adoption as a requirement
- remove transitional documentation that implies local-pack installation is the normal
  long-term path

Acceptance criteria:

- [ ] frontend SDK upgrades are performed by version bump, lockfile update, and test
  validation
- [ ] rollback procedure is documented and tested at least once
- [ ] migration completion documents reference this PRD as required work

---

## Frontend-Specific Changes Required

These changes are required in `durion-positivity-frontend` once published packages are
available:

- replace SDK bootstrap scripts with declared dependencies
- update `.npmrc` to support the selected private registry
- update CI auth for dependency installation
- update Docker build auth for dependency installation
- remove `.sdk-src` and `.sdk-tarballs` from the standard build path

Until Phase 3 is complete, the current local-pack workflow remains transitional only.

---

## Verification Gates

Run these gates after Phase 3 and again after Phase 4:

```bash
# Clean install from registry only
rm -rf node_modules package-lock.json
npm install

# Build and test as a normal consumer
npm run build
npm test -- --watch=false

# Confirm no build-time SDK checkout assumptions remain
rg -n "\\.sdk-src|\\.sdk-tarballs|DURION_SDK_" .
```

For CI validation, also require one green run of the frontend workflows without any SDK
repository checkout step.

---

## Risks

- SDK contracts are still changing; publishing too early as "stable" creates churn for
  consumers
- registry authentication can complicate Docker and local developer onboarding
- partial publication of only some packages would create inconsistent dependency graphs
- package metadata issues in generated SDK packages may not surface until external
  install consumers exercise them

Mitigations:

- use prerelease versions first
- publish all consumer-facing Angular SDK packages together
- validate installability from a clean consumer before promoting any release
- keep a version-pinning rollback path

---

## Definition of Done

- [ ] `durion-positivity-sdk-angular` publishes installable prerelease packages from CI
- [ ] `durion-positivity-frontend` consumes those packages through declared dependencies
- [ ] `npm ci` is sufficient for frontend setup in local, CI, and Docker contexts
- [ ] no standard frontend build path clones or packs the SDK repository
- [ ] the SDK migration completion PRD requires published-SDK adoption for final signoff

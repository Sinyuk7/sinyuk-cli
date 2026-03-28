# MEMORY

Updated: 2026-03-28

## Architecture: Launcher Activity + Feature Domain

Decided in `/plan-ceo-review` (2026-03-28), implemented same day.

### Core Model

```
sinyuk-cli = Android Application
  FeatureDomain = App Module (lora-dataset, git, hello-world)
  ActionEntry   = Activity  (caption, crop, mr, push)
```

- **Launcher Pattern**: Workbench is a launcher — select domain → select action → launch → exit(0). No return to Workbench. Process dies after Action completes.
- **Two-level routing**: CLI `sinyuk-cli <domain> <action> [opts]` / Workbench menu domain → action.
- **State management**: Zustand vanilla store per Action. Module-level singleton (safe because process dies). No shared/global state across Actions.
- **Navigation**: Pure forward — no back button, no return to previous step. Ctrl+C exits.
- **Exit contract**: Action calls `onComplete(exitCode)` → upper layer (WorkbenchCommand or CLI command) handles `process.exit()`. Action never calls `process.exit` directly.
- **Terminology**: `step` for internal navigation state (not phase/stage/page).

### Directory Convention

```
features/
  types.ts                     # FeatureDomain + ActionEntry
  index.ts                     # getFeatureDomains() registry
  <domain>/
    index.ts                   # domain registration
    shared/                    # domain-scoped: config, scan, pipeline, types
    <action>/
      store.ts                 # Zustand vanilla store
      screen.tsx               # Activity root (switch on store.step)
      run.ts                   # Canonical non-interactive runner
      command.ts               # Clipanion command
      index.ts                 # ActionEntry registration
```

### Workspace Rule

- **User-home defaults**: feature-owned templates and developer-facing defaults live under `~/.sinyuk-cli/features/<domain>/`
- **Dataset-local mutable state**: when a feature needs per-target workspace files, store them under `_<domain_slug>/` inside the user-selected target directory
- **Slug rule**: `domain_slug = feature id` with `-` replaced by `_` (example: `lora-dataset -> _lora_dataset`)
- **No shared `_meta/` bucket**: do not place feature-private mutable state into generic `_meta/`; use the feature-scoped directory directly
- **No speculative platform abstraction**: keep the naming rule in architecture memory first; only extract a broader shared platform abstraction after a second real feature needs it

### Test Placement Rule

- **Feature-local tests live with the feature**: when a test mainly verifies one feature domain, place it under that feature's own test directory instead of a global top-level tests bucket
- **Recommended shape**: `src/features/<domain>/tests/` for feature-owned contract/unit tests tied to that module's behavior
- **Global tests stay global**: only cross-feature, platform-boundary, or app-entry smoke tests should remain in top-level `tests/`
- **Goal**: keep feature behavior, fixtures, and tests discoverable in one place so future feature work stays localized

### Test Data Rule

- **Tracked fixtures must stay small and deterministic**: only commit tiny text samples or minimal binary fixtures that are essential for repeatable tests
- **Large files stay local**: test images, ad-hoc datasets, generated outputs, and temporary debug data must not be committed to git
- **Recommended local path**: store feature-specific large or temporary test data under `src/features/<domain>/tests/.local-data/`
- **Temporary generated artifacts**: store scratch outputs under `src/features/<domain>/tests/.tmp/`
- **Git policy**: `.local-data/` and `.tmp/` inside feature test directories are ignored by default

### Key Decisions Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Feature autonomy level | Activity (not Module) | Sufficient for current needs, avoids over-engineering |
| 2 | State management | Zustand vanilla store per Action | Replaces 317 LOC hand-rolled pub/sub |
| 3 | batch/crop relationship | Fully independent Actions | Zero data dependency; complexity halved (12→6 steps) |
| 4 | Process exit | onComplete callback, not direct process.exit | Testability, canonical runner reuse |
| 5 | Navigation | Pure forward, no back | CLI wizard standard; avoids Ink unmount/remount issues |
| 6 | Shared abstractions | None — no createFeatureStore | Defer until 3rd domain proves need |
| 7 | Domain help command | Show action list on bare domain invocation | Matches git/docker UX |
| 8 | Run.ts per Action | Yes — each Action has own canonical runner | SSOT principle from AGENTS.md |
| 9 | Step type definition | Each Action defines own step type independently | No premature shared types |

### Pre-existing Issues (not from this refactor)

- workbench.ts L57-59: stdin/stdout type mismatch (Readable vs ReadStream) — TODO-007
- hello-world/command.ts: `path` property collides with Clipanion base class — TODO-007

### Dependencies Added

- `zustand` — React state management (<1KB gzip), used for per-Action stores

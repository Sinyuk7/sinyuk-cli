# MEMORY

> **[SYSTEM DIRECTIVE: EXECUTOR RULE - DO NOT REMOVE]**
> 1. **STRICT LENGTH LIMIT:** This file (`MEMORY.md`) MUST NEVER exceed 300 lines.
> 2. **READ BEFORE WRITE:** Every time you are instructed to update or append to this file, you MUST read the entire document first.
> 3. **AUTO-COMPRESS & PRUNE:** Before writing new content, evaluate the current line count. If the new addition will cause the file to exceed 300 lines, you MUST actively compress, summarize, or delete older/obsolete context to make room. Always prioritize the most current and critical architectural decisions.

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
| 10 | Config strategy | Feature Autonomy — zero merge | Global only has `logging`; each feature reads its own config from `~/.sinyuk-cli/features/<id>/config.yaml`; dataset config at `<dataset>/_lora_dataset/config.yaml` is strictly separate. No fallback injection, no layer merging. |
| 11 | Config validation | Strict Zod schemas per layer | `.strict()` on all config schemas — unknown/typoed fields crash immediately. Template-driven init via physical `.example` file copies, no code defaults. |

### Config Architecture (Dead-Simple Strategy)

Four iron rules:
1. **Template-Driven Init**: Physical file copies from `templates/`, no code defaults
2. **Strict Schema Validation**: Zod `.strict()` to crash on unknown/typoed fields
3. **No Fallback Injection**: Global and Dataset configs are strictly separate objects in memory
4. **Forward Compatibility**: Users manually update configs on version upgrades; no auto-migration

Three config layers (physically isolated, never merged):
- **Core Config** `~/.sinyuk-cli/config.yaml` — only `logging.level`
- **Feature Machine Config** `~/.sinyuk-cli/features/<id>/config.yaml` — API keys, concurrency, provider settings (read by each feature autonomously)
- **Dataset Config** `<dataset>/_lora_dataset/config.yaml` — hyperparams, request tuning (read during action bootstrap)

Key files:
- `src/platform/config/schema.ts` — `CoreConfigSchema` (thin, only logging)
- `src/platform/config/load-config.ts` — `loadCoreConfig()` (no merge logic)
- `src/features/lora-dataset/shared/schema.ts` — feature-owned schemas + `loadLoraDatasetFeatureConfig()` / `loadLoraDatasetDatasetConfig()`
- `src/platform/execution-context.ts` — passes `sinyukHomePath` down, not a merged config snapshot

### Pre-existing Issues (not from this refactor)

- workbench.ts L57-59: stdin/stdout type mismatch (Readable vs ReadStream) — TODO-007
- hello-world/command.ts: `path` property collides with Clipanion base class — TODO-007

### Secrets & Credential Rule

- **NEVER hardcode API keys, tokens, or passwords in source files** — this includes test files, config files, and any tracked code
- **Environment variable injection only**: all secrets must be read from environment variables at runtime; test files must read from `process.env` and skip/fail gracefully when the variable is missing
- **Recommended env var naming**: `TEST_<SERVICE>_API_KEY` for test-specific credentials (e.g. `TEST_LORA_API_KEY`)
- **`.env` files are gitignored**: if a `.env` file is used for local convenience, it must be listed in `.gitignore`
- **Violation severity**: hardcoding a secret in a committed file is a blocking-level issue — must be caught and reverted before any push

### E2E Test Design Rule

- **One test dataset = dedicated test cases**: each test data directory under `.local-data/` represents a distinct scenario; design specific E2E cases per dataset rather than reusing datasets across unrelated tests
- **Dataset naming convention**: `test-{N}-{description}` (e.g. `test-1-image-1`, `test-2-image-5`) — the name should describe the scenario's key characteristic
- **E2E tests that call real external APIs**: must read credentials from environment variables, set generous timeouts, and include clear skip logic when credentials are unavailable

### Dependencies Added

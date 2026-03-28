# TODOS

Updated: 2026-03-28
Source: `/plan-eng-review` decisions (`14A`, `15A`, `16A`), `/plan-ceo-review` architecture decisions

## CLI

### Add Interactive Fallback Decision Table

**What:** Write a fallback behavior matrix for direct commands vs interactive handoff (TTY/non-TTY, recoverable/non-recoverable errors, CI contexts).

**Why:** Review decisions fixed the high-level rule, but implementation can still drift without concrete condition-action mapping.

**Context:** Eng review selected "TTY + recoverable only" fallback. `getInteractiveFallbackDecision()` in `fallback-policy.ts` implements the base logic with unit test coverage. This TODO turns that into explicit condition-action documentation and user-facing error messaging standards. Covers: TTY/non-TTY detection, `CI` env flag, recoverable vs non-recoverable errors, and expected CLI output per scenario.

**Effort:** S (human ~2hr / CC ~10 min)
**Priority:** P2
**Depends on:** None

## Testing

### Define Test Expansion Gates

**What:** Define objective triggers for upgrading from minimal test baseline to broader integration/E2E coverage.

**Why:** Current plan intentionally uses minimal tests in Phase 1; without predefined gates, expansion becomes ad-hoc and delayed.

**Context:** Current baseline: 3 smoke tests (`cli-help`, `config-show`, `hello-world-ci-failfast`) + 2 unit tests (`config-loader`, `fallback-policy`) + 6 feature-local test files for `lora-dataset` (scan, workspace, crop, caption E2E, pipeline E2E, bootstrap). Aligned with AGENTS.md "Contract-First Testing" strategy. This TODO defines when broader coverage becomes mandatory — candidate triggers: second side-effecting feature, remote operations, first regression incident.

**Effort:** S (human ~1hr / CC ~5 min)
**Priority:** P2
**Depends on:** None

## Design

*(No open items)*

## Distribution

### Define Cross-Platform Release Matrix

**What:** Define supported distribution targets and CI publish matrix for `sinyuk-cli` artifacts.

**Why:** Current plan has publish flow but no explicit platform/arch support contract, which can cause "works on my machine" releases.

**Context:** `package.json` has `"bin"` and `"files": ["dist"]` configured for npm packaging. No CI/CD workflow exists yet (no `.github/workflows/`). This TODO ensures distribution targets are explicit before broad usage — document target OS/arch combinations and map each to build/publish jobs.

**Effort:** M (human ~4hr / CC ~15 min)
**Priority:** P3
**Depends on:** Initial package scaffold and first runnable CLI build

## Completed

### Implement Launcher Activity + Feature Domain Architecture

**What:** Implement FeatureDomain + ActionEntry type system, Zustand stores, lora-dataset domain split, and Workbench two-level menu.

**Why:** Required architecture to support multi-domain, multi-action CLI with both interactive and non-interactive paths.

**Context:** Architecture landed — FeatureDomain + ActionEntry types, Zustand stores for caption/crop, lora-dataset split into shared/caption/crop, Workbench two-level menu, Launcher Activity single-trip pattern.

**Effort:** L
**Priority:** P0
**Depends on:** None
**Completed:** v0.1.0 (2026-03-28)

### Wire Clipanion Commands for caption/crop Actions

**What:** Create Clipanion Command classes for `lora-dataset caption`, `lora-dataset crop`, and domain help command `lora-dataset`.

**Why:** CLI non-interactive path was broken — Action index files threw `TODO: Command not yet wired`.

**Context:** `CaptionCommand` (path/full/preview/concurrency options), `CropCommand` (path/crop-profile options), and `LoraDatasetHelpCommand` (lists available actions) all implemented with Clipanion `static paths`, config loading, interactive fallback, and canonical runner delegation.

**Effort:** M
**Priority:** P1
**Depends on:** TODO-005
**Completed:** v0.1.0 (2026-03-28)

### Reconcile TypeScript Errors

**What:** Fix 8 TS errors blocking clean `tsc --noEmit`.

**Why:** Blocked clean compile and CI enforcement.

**Context:** Two fixes: (1) `Writable`/`Readable` vs `WriteStream`/`ReadStream` — workbench.ts used `as unknown as ReadStream/WriteStream` casts, run.ts files relaxed param type to `Writable`, lora-dataset/command.ts relaxed `writeDomainHelp` param to `Writable`. (2) hello-world `path` → `targetPath` to avoid collision with `Command.path`.

**Effort:** S
**Priority:** P2
**Depends on:** None
**Completed:** v0.1.0 (2026-03-28)

### Create DESIGN.md for Terminal Design Tokens

**What:** Create a project-level `DESIGN.md` defining terminal design tokens, state language, and reusable UI conventions.

**Why:** Without a shared system file, future features drift in color semantics, hierarchy, and interaction copy.

**Context:** Extracted from 4 existing screens (workbench, hello-world, caption, crop). Covers: color semantics, typography hierarchy, breadcrumb convention, layout patterns, state language, component usage, exit patterns, CLI output standards, and anti-patterns.

**Effort:** M
**Priority:** P3
**Depends on:** None
**Completed:** v0.1.0 (2026-03-28)

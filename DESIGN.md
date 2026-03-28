# DESIGN.md — Terminal Design System

Updated: 2026-03-28
Applies to: sinyuk-cli v0.1.x

This document is the Single Source of Truth for visual and interaction design across all
sinyuk-cli features. Every new screen, component, and CLI output MUST conform to these
conventions. Deviations require explicit justification.

> CLI 的高级感 = 70% 状态设计 + 20% 排版 + 10% 动画，不是靠库堆出来的。

---

## 1. Color Semantics

Colors express **meaning**, not decoration. Each color maps to exactly one semantic role.

| Semantic Role      | Ink Color       | Usage                                        |
|--------------------|-----------------|----------------------------------------------|
| `brand`            | `blueBright`    | ASCII banner, domain/action title breadcrumb  |
| `confirm`          | `yellowBright`  | Destructive or significant confirmation prompt |
| `dryRun`           | `cyan`          | Dry-run mode indicators                       |
| `muted`            | `dimColor`      | Secondary info, config lines, nav hints, help  |
| `success`          | (via StatusMessage `variant="success"`) | Operation completed successfully |
| `warning`          | (via StatusMessage `variant="warning"`) | Completed with partial failures  |
| `error`            | (via StatusMessage `variant="error"`)   | Operation failed                 |
| `info`             | (via StatusMessage `variant="info"`)    | Informational, no action needed  |

**Rules:**
- Never use raw color names for semantic purposes — always map to the role above.
- `dimColor` is the default for anything not primary content (config paths, key hints, metadata).
- Status feedback MUST use `<StatusMessage variant="...">` — never raw colored `<Text>`.
- No `red`/`green` outside of StatusMessage — terminal colorblind accessibility.

---

## 2. Typography Hierarchy

Terminal "typography" is expressed through color weight, indentation, and symbols.

```
  Level 1 — BRAND TITLE        <Text color="blueBright">           banner / breadcrumb
  Level 2 — PRIMARY CONTENT    <Text>                              prompts, results, labels
  Level 3 — SECONDARY INFO     <Text dimColor>                     config status, file paths
  Level 4 — NAVIGATION HINT    <Text dimColor>                     keybinding hints (bottom)
```

**Rules:**
- Maximum 2 indentation levels (0 and 2 spaces). Deeper nesting is a UX smell.
- One blank line (`gap={1}`) between logical groups. Never `gap={2}` or more.
- Prompts end with `:` — e.g., `Enter dataset path:`, `Select crop profile:`.
- Confirmation prompts end with `[Y/n]` or `[y/N]` to indicate default.

---

## 3. Breadcrumb Convention

Every Action screen displays a breadcrumb as its first line, using `›` as separator.

```
  Format:    <domain> › <action>[ › <substep>]
  Color:     blueBright
  Examples:
    lora-dataset › caption
    lora-dataset › caption › preview
    lora-dataset › crop › profile
    hello-world › run
```

**Rules:**
- Domain and action IDs come from the `FeatureDomain.id` and `ActionEntry.id` registry.
- The Workbench launcher screen uses the ASCII banner instead of a breadcrumb.
- Optional substep (e.g., `› preview`) only when the action has distinct named phases.
- Never use "pipeline" or other ad-hoc labels — use the registered `id` values.

> ⚠️ **Migration note:** `hello-world/screen.tsx` currently uses `"hello-world pipeline"`.
> Must be changed to `"hello-world › run"` to align with this convention.

---

## 4. Layout Patterns

### 4.1 Standard Screen Container

Every screen view uses the same outer container:

```tsx
<Box flexDirection="column" gap={1}>
  <Text color="blueBright">{breadcrumb}</Text>
  {/* primary content */}
  <Text dimColor>{hints}</Text>
</Box>
```

### 4.2 Navigation Hints (bottom bar)

Action screens that use Select or MultiSelect SHOULD show keybinding hints as the last child:

```tsx
<Text dimColor>↑/↓ Navigate  Enter Select  Ctrl+C Quit</Text>
```

For ConfirmInput steps, the hint is implicit in the `[Y/n]` prompt — no separate hint needed.

### 4.3 Empty States

When a list or scan yields zero results, show an `<StatusMessage variant="info">` with
a concrete message and a recovery action:

```tsx
<StatusMessage variant="info">No files found in {path}</StatusMessage>
<Text>Change path? [Y/n]</Text>
<ConfirmInput onConfirm={...} onCancel={props.onExit} />
```

Never show a blank screen. Empty states are features.

---

## 5. State Language

Every Action screen is a state machine driven by a `step` (or `stage`) field.
The standard lifecycle:

```
  ┌──────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐    ┌──────┐
  │ input │───▶│ scanning  │───▶│ confirm  │───▶│ running │───▶│ done │
  └──────┘    └──────────┘    └──────────┘    └─────────┘    └──────┘
       │            │              │               │              │
       └────────────┴──────────────┴───────────────┴──────────────┘
                              ▼
                         ┌─────────┐
                         │  error  │ ◀── any step can transition here
                         └─────────┘
                              │
                         retry → input
                         cancel → onExit
```

**Step name conventions:**
- `input` — user provides required parameters (path, options)
- `scanning` — async discovery/validation in progress
- `confirm` — user reviews before committing (destructive/expensive operations)
- `running` — batch operation in progress with ProgressBar
- `done` — success summary with exit prompt
- `error` — failure with retry/cancel choice

**Rules:**
- Step names are lowercase, single-word when possible.
- Each Action defines its own step union type — no shared step enum.
- Additional steps (e.g., `profile`, `preview-result`, `selecting`) are allowed
  when the action has domain-specific intermediate states.
- The `error` step is mandatory — every Action MUST handle it.
- Navigation is pure forward. No back button. Ctrl+C exits the process.

---

## 6. Interactive Component Usage

| Component        | When to Use                              | Import From   |
|------------------|------------------------------------------|---------------|
| `TextInput`      | Free-form user input (paths, strings)    | `@inkjs/ui`   |
| `Select`         | Single choice from list (2+ options)     | `@inkjs/ui`   |
| `MultiSelect`    | Multi-choice from list                   | `@inkjs/ui`   |
| `ConfirmInput`   | Yes/No decision, exit prompts            | `@inkjs/ui`   |
| `Spinner`        | Short async wait (scan, preview)         | `@inkjs/ui`   |
| `ProgressBar`    | Batch operations with known total        | `@inkjs/ui`   |
| `StatusMessage`  | Operation result feedback                | `@inkjs/ui`   |

**Rules:**
- Prefer `@inkjs/ui` components over custom implementations.
- `Spinner` label format: `"Scanning {path}..."` / `"Running preview caption..."` — verb + gerund.
- `ProgressBar` always paired with count text: `[current/total] contextInfo`.
- `StatusMessage` is the ONLY way to show success/warning/error/info feedback.

---

## 7. Exit & Completion Patterns

### 7.1 Action Completion

On `done` step, always show:
1. `<StatusMessage>` with result summary
2. Optional secondary info in `dimColor` (output path, summary path)
3. Exit prompt: `Exit? [Y/n]` with `<ConfirmInput>`
4. Both confirm and cancel call `actions.complete()` then `props.onExit()`

### 7.2 Error Recovery

On `error` step, always show:
1. `<StatusMessage variant="error">` with error message
2. Retry prompt: `Retry? [Y/n]` with `<ConfirmInput>`
3. Confirm → `actions.retryFromError()` (resets to `input`)
4. Cancel → `props.onExit()`

### 7.3 Ctrl+C

Global exit handler. Process dies. No cleanup UI needed — `ShutdownController` handles
signal propagation via `AbortSignal`.

---

## 8. CLI (Non-Interactive) Output

When running via direct CLI command (not Workbench), output follows a different pattern:

```
  Progress:  [1/10] path/to/file.ts
             [2/10] path/to/other.ts (dry-run)
  Result:    Processed 10 files, failed 2.
  Error:     CliError with code and message to stderr
```

**Rules:**
- Progress lines: `[current/total] filename[suffix]` — one per file, no blank lines.
- Result summary: single line to stdout.
- Errors: `CliError` with named `code` field, message to stderr.
- No color in CI output — respect `NO_COLOR` env when implemented.

---

## 9. Recommended UI Stack

### Installed (core)

| Package       | Role                         |
|---------------|------------------------------|
| `ink`         | React terminal rendering     |
| `@inkjs/ui`   | Standard interactive widgets |
| `zustand`     | Per-Action state management  |

### Recommended to Add (when first needed)

| Package          | Role                          | Priority  |
|------------------|-------------------------------|-----------|
| `cli-spinners`   | Extended spinner styles       | 必装 (P2) |
| `log-symbols`    | Cross-platform ✔/✖/ℹ/⚠ glyphs | 必装 (P2) |
| `flossum`        | ASCII art / figlet banners    | 可选 (P3) |
| `gradient-string`| Gradient text for branding    | 可选 (P4) |

**Do NOT install until the specific need arises.** The current `@inkjs/ui` Spinner and
StatusMessage cover 90% of use cases.

---

## 10. Anti-Patterns

- ❌ **Inline color strings** — Use semantic role names from Section 1.
- ❌ **Custom status indicators** — Use `<StatusMessage>` exclusively.
- ❌ **Deep nesting** — Max 2 indent levels. Flatten or split the view.
- ❌ **Silent empty states** — Every zero-result must show explicit `<StatusMessage variant="info">`.
- ❌ **Back navigation** — Pure forward only. No return to previous step.
- ❌ **Shared step types** — Each Action owns its step union. No premature abstraction.
- ❌ **Bare `process.exit()`** — Actions call `onComplete(exitCode)`, never exit directly.
- ❌ **Color for decoration** — Every color has a semantic reason.
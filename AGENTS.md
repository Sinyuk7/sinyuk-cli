# AGENTS.md

## 🤖 Identity & Role

- **Role:** Expert Developer & System Architect.
- **Priority Hierarchy:** User Prompt > `MEMORY.md` > `AGENTS.md` > Existing Code.
- **Mission:** Write correct, minimal, and maintainable code. Keep code clear, high-density, and explicit. Align with existing architecture and aggressively avoid over-engineering.

## 🛑 Boundaries & Execution Context

- **Boot Sequence:** Always read `AGENTS.md` and `MEMORY.md` (if it exists) before execution. Inspect only relevant files.
- **Always Do:** Prefer modifying existing code over creating new files. Keep structural changes minimal.
- **Ask First:** Before introducing new platform-level abstractions, dependencies, or modifying core configurations.
- **Never Do:** Silently swallow errors, create hidden global state, or execute implicit DB/Network/FS operations.

## 🏗️ Architecture & Design Playbook

- **Vertical Slicing over Horizontal Layering (VSA/FSD):** Adhere to the "Thin platform + thick feature" constraint. The Platform tier must remain extremely thin, handling only basic infrastructure (routing, config, logging). Commands, UI states, validation schemas, and business logic MUST be highly cohesive and localized within their specific `Feature` directories.
- **Explicit > Clever & Fail-Fast:** Reject implicit behaviors. Do not use hidden default values for missing configurations. Enforce strict configuration loading sequences; if required inputs are missing or YAML formatting is invalid, the process MUST fail fast and block execution immediately.
- **Defer Decisions & YAGNI:** Do not anticipate future requirements. Advanced capabilities (e.g., Task Center, global sessions, deep merging, plugin markets) are strictly "Deferred." Never introduce platform-level abstractions until a second, concrete use case necessitates reuse. Let architecture be pulled by actual needs, not pushed by assumptions.
- **Canonical Execution Path (SSOT):** Maintain a Single Source of Truth for execution logic. Whether invoked via direct CLI input (`cli <feature>`) or an interactive UI/TUI workbench, all workflows MUST converge into a single `run.ts` (Canonical Runner) sharing the exact same `ExecutionContext`. Treat CLI parsers and UI layers purely as input adapters to prevent logic drift.
- **Contract-First Testing:** During early scaffolding and prototyping, omit unit tests for volatile UI and feature logic. Implement only 2-3 contract tests validating Platform boundary rules, plus 1 smoke test to ensure the application does not crash. Defer high-maintenance Integration/E2E testing until core APIs and logic are completely stabilized.

## 💻 Code & File Standards

- **Core Principles:** Clarity > Cleverness. Explicit > Implicit. Small files > Large files. Deterministic > Hidden magic. Simple flow > Deep helpers.
- **File Constraints:** Files exceeding 300 LOC indicate poor design and must be split by responsibility. Prefer small, highly focused modules.
- **Function Constraints:** One function = one clear job. Keep functions under 50 LOC. The call chain must be completely traceable. Avoid vague or overly generic helper functions.
- **Types:** Prefer strict, strong typing. Types must express precise business meaning rather than acting as weak data containers (`any`, `Record<string, any>`).
- **State & Flow:** Control flow must remain shallow. No hidden globals or implicit memory. State ownership must be absolute and explicit.

## 📝 Documentation & Contracts

- **Comments:** Keep them brief and highly actionable. Explain the business intent, not the obvious code mechanics. Actively remove stale comments.
- **Side Effects:** Must be explicitly declared, kept exclusively at system boundaries, and never hidden within core logic.
- **Docstrings (REQUIRED):** All core functions must include a standardized docstring mapping exact I/O and intent.

```python
"""Map task snapshots into task list and detail view models.

INTENT: Convert task snapshot list into dashboard view models
INPUT: browser_state, snapshots, metrics_snapshot
OUTPUT: TaskDashboardViewModel
SIDE EFFECT: None
FAILURE: Return empty/default state TaskDashboardViewModel
"""
```

## 📁 STRUCTURE

```
.
├── src/
│   ├── index.ts          # CLI entry (Clipanion bootstrap)
│   ├── cli/              # CLI context types
│   ├── commands/         # Built-in commands
│   ├── features/         # Feature modules (VSA)
│   ├── platform/         # Thin infrastructure layer
│   └── shared/           # Shared types
├── tests/                # Unit + smoke tests
├── dist/                 # Build output (tsup)
└── [config files]        # See section below
```

## 🚀 COMMANDS

```bash
# Development
npm run build              # Build with tsup
npm run build:watch        # Watch mode
npm run lint               # ESLint check
npm run lint:fix           # ESLint fix
npm run format             # Prettier write
npm run format:check       # Prettier check

# Testing
npm test                   # Build + all tests
npm run test:unit          # Unit tests only
npm run test:smoke         # Build + smoke tests

# CLI Usage (after npm link)
sinyuk-cli init            # Initialize global config
sinyuk-cli                 # Open interactive workbench
sinyuk-cli config show     # Show merged config
sinyuk-cli hello-world run --path . --all
```

## ⚙️ CONFIGURATION

| File               | Purpose                                 |
| ------------------ | --------------------------------------- |
| `package.json`     | ESM, Node>=18, CLI bin mapping          |
| `tsconfig.json`    | Strict mode, ES2022, Bundler resolution |
| `eslint.config.js` | TS-only linting, Prettier integration   |
| `.prettierrc.json` | Tabs, singleQuote, printWidth:100       |
| `tsup.config.ts`   | ESM bundle, shebang, Node18 target      |
| `vitest.config.ts` | Unit + smoke test setup                 |

## ✅ Completion Checklist

Before finalizing any response or task execution, silently verify:

- [ ] `MEMORY.md` read and incorporated.
- [ ] Code modifications kept to the absolute minimum required.
- [ ] Resulting code is clearer and more compact than before.
- [ ] All side effects are explicitly declared.
- [ ] Failure paths and errors are explicitly handled without silent fallbacks.

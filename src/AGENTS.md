# src/ AGENTS.md

Source code directory for sinyuk-cli.

## STRUCTURE

```
src/
├── index.ts              # CLI bootstrap (Clipanion)
├── cli/
│   ├── context.ts        # SinyukCliContext type + helpers
│   └── ...
├── commands/
│   ├── config-show.ts    # `sinyuk-cli config show`
│   ├── init.ts           # `sinyuk-cli init`
│   └── workbench.ts      # `sinyuk-cli` (interactive)
├── features/
│   ├── index.ts          # Feature registry
│   ├── types.ts          # FeatureEntry contract
│   ├── hello-world/      # Example feature
│   └── lora-dataset/     # LoRA dataset feature
├── platform/
│   ├── execution-context.ts  # ExecutionContext + factory
│   ├── config/           # Config loading + schema
│   ├── shutdown/         # Shutdown controller
│   └── logging/          # Run-scoped logger
└── shared/
    └── feature-screen.ts # Shared types for Ink screens
```

## WHERE TO LOOK

| Task                 | Location                        | Notes                           |
| -------------------- | ------------------------------- | ------------------------------- |
| Add new command      | `commands/`                     | Extend from Clipanion Command   |
| Add new feature      | `features/{name}/`              | Implement FeatureEntry contract |
| Feature registration | `features/index.ts`             | Add to FEATURES array           |
| Config schema        | `platform/config/schema.ts`     | Zod schemas                     |
| Execution context    | `platform/execution-context.ts` | Immutable run context           |

## CONVENTIONS

- **Vertical Slicing**: Each feature owns its command, screen, schema, and run logic
- **Platform Thin**: Platform layer only handles config, logging, shutdown—no business logic
- **Explicit Contracts**: FeatureEntry requires `id`, `title`, `description`, `getCommand()`, `getScreen()`
- **Immutable Context**: ExecutionContext is frozen at creation with runId, configSnapshot, envSnapshot

## ANTI-PATTERNS

- NO business logic in platform/
- NO shared state between features
- NO direct process.exit()—use shutdown controller

## COMMANDS

```bash
# Build
npm run build

# Test
npm run test:unit
npm run test:smoke
```

# hello-world/ AGENTS.md

Hello-world demo feature — example implementation of the VSA/FSD pattern.

## STRUCTURE

```
hello-world/
├── index.ts      # FeatureEntry factory
├── command.ts    # Clipanion command (hello-world run)
├── run.ts        # Pipeline: scan → process → result
├── schema.ts     # Zod config schema
└── screen.tsx    # Ink interactive screen
```

## CONTRACT

Implements `FeatureEntry`:

- `id`: 'hello-world'
- `getCommand()`: Returns `HelloWorldRunCommand`
- `getScreen()`: Returns `HelloWorldScreen` component

## PIPELINE

```
scanHelloWorldFiles() → runHelloWorldPipeline() → printResult()
```

| Phase   | Function                  | Responsibility                                    |
| ------- | ------------------------- | ------------------------------------------------- |
| Scan    | `scanHelloWorldFiles()`   | Recursively scan directory, respect includeHidden |
| Process | `runHelloWorldPipeline()` | Sequential file processing with progress callback |
| Output  | `printResult()`           | stdout summary (processed/failed count)           |

## WHERE TO LOOK

| Task              | Location                           | Notes                                |
| ----------------- | ---------------------------------- | ------------------------------------ |
| Add CLI flags     | `command.ts`                       | Extend `Option.String/Boolean/Array` |
| Change scan logic | `run.ts` → `scanHelloWorldFiles()` | Modify recursive directory walk      |
| Change processing | `run.ts` → `processOneFile()`      | File-level operation                 |
| Config schema     | `schema.ts`                        | Zod validation + defaults            |
| UI behavior       | `screen.tsx`                       | Ink components, state transitions    |

## CONVENTIONS

- Uses docstrings with INTENT/INPUT/OUTPUT/SIDE EFFECT/FAILURE
- Supports both CLI (`--path/--all/--file`) and interactive (screen) modes
- Progress callback for real-time feedback
- Dry-run support via ExecutionContext

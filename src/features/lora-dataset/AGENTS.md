# lora-dataset/ AGENTS.md

LoRA dataset preparation feature — AI image captioning pipeline with crop output.

## STRUCTURE

```
lora-dataset/
├── run.ts           # Session + pipeline orchestration
├── artifacts.ts     # File I/O: captions, crops, summaries
├── provider.ts      # LLM provider integration (API calls)
├── scheduler.ts     # Concurrent task scheduler with retries
└── schema.ts        # Zod config: provider, crops, prompts
```

## CONTRACT

Exposed via `run.ts`:

- `createLoraDatasetSession()` — Interactive session factory
- `runLoraDatasetNonInteractive()` — CLI batch mode
- `runPreview()` / `runBatch()` / `runCrop()` — Core operations

## PIPELINE

```
Scan → Preview → Batch Caption → Crop Output
```

| Phase   | Function               | Output                                      |
| ------- | ---------------------- | ------------------------------------------- |
| Scan    | `discoverLoraImages()` | `{images[], basePath}`                      |
| Preview | `runPreview()`         | `{caption, responseText}`                   |
| Batch   | `runBatch()`           | `{caption.txt, raw.json, failed-items.txt}` |
| Crop    | `runCrop()`            | `{cropped/, copied .txt}`                   |

## STATE MACHINE

```
input → scanning → mode → previewing → preview-result
                              ↓
                    full-confirm → batch-running → post-batch
                              ↓
                         crop-select → crop-running → completed
```

Error phase: `error` (with returnPhase for retry)

## WHERE TO LOOK

| Task              | Location           | Notes                                  |
| ----------------- | ------------------ | -------------------------------------- |
| Add provider      | `provider.ts`      | Implement `requestCaptionForImage()`   |
| Change crop logic | `artifacts.ts`     | `cropImageToPath()`, sharp integration |
| Change scheduling | `scheduler.ts`     | `runScheduledTasks()` concurrency      |
| Config schema     | `schema.ts`        | Crop profiles, provider options        |
| State transitions | `run.ts` → session | `update()`, phase handlers             |

## CONVENTIONS

- Idempotent writes: skip if caption.txt exists
- Failed items logged to `failed-items.txt`
- Run summary in `run-summary.json`
- Retryable errors handled by scheduler; fatal errors abort

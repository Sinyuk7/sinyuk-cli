# lora-dataset

Feature domain for dataset captioning and crop preparation.

## What It Does

- `caption`: scan dataset images, bootstrap local prompt, preview one sample, then run full caption batch
- `crop`: scan dataset images, preview ratio distribution, build a multi-spec crop plan, then generate `dataset-crop-*` outputs

## Execution Chain

- CLI domain entry: [command.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/command.ts)
- Action adapters:
  - [caption/command.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/caption/command.ts)
  - [crop/command.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/crop/command.ts)
- Canonical non-interactive runners:
  - [caption/run.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/caption/run.ts)
  - [crop/run.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/crop/run.ts)
- Interactive stores/screens:
  - [caption/store.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/caption/store.ts)
  - [caption/screen.tsx](/D:/github/sinyuk-cli/src/features/lora-dataset/caption/screen.tsx)
  - [crop/store.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/crop/store.ts)
  - [crop/screen.tsx](/D:/github/sinyuk-cli/src/features/lora-dataset/crop/screen.tsx)
- Shared execution core:
  - [shared/pipeline.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/shared/pipeline.ts)
  - [shared/workspace.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/shared/workspace.ts)
  - [shared/bootstrap.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/shared/bootstrap.ts)
  - [shared/provider.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/shared/provider.ts)
  - [shared/artifacts.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/shared/artifacts.ts)

## Config And Workspace Rules

- User-level defaults live in `~/.sinyuk-cli/features/lora-dataset/`
- User-level feature config path: `~/.sinyuk-cli/features/lora-dataset/config.yaml`
- Prompt template path: `~/.sinyuk-cli/features/lora-dataset/prompts/user-prompt.txt.example`
- User-level feature config sections:
  - `provider` - base URLs, model, and API key env var
  - `scheduler` - concurrency, timeout, and retry controls
  - `analysis` - image resize and JPEG quality before upload
  - `crop` - ratio and resolution options for the crop planner
- Dataset-local mutable state lives in `<dataset>/_lora_dataset/`
- Dataset-local files:
  - `config.yaml`
  - `user-prompt.txt`
  - `run-summary.json`
  - `failed-items.txt`
  - `raw/*.json`
- Caption `.txt` outputs stay next to source images
- Crop outputs stay in `dataset-crop-<ratio>-<longEdge>/`
- Scanner excludes:
  - `_lora_dataset/`
  - `dataset-crop-*`
  - legacy `_meta/`

## Bootstrap Contract

- First run with no dataset-local config:
  - copy template to `<dataset>/_lora_dataset/config.yaml`
  - continue with that exact file as the only dataset-local request config
- First run with no local prompt:
  - copy template to `<dataset>/_lora_dataset/user-prompt.txt`
  - continue immediately
- Local prompt is allowed to stay equal to the template
- CLI and interactive flows share the same bootstrap logic
- Dataset-local config is strict:
  - unknown fields fail immediately
  - missing required fields fail immediately
  - no fallback injection from global config into dataset config
- Interactive caption flow:
  - if the provider API key env var is missing, prompt for the token in-terminal
  - save it to the current process and the Windows user environment
  - continue preview / batch automatically after saving
- Feature config reset is explicit:
  - `sinyuk-cli init` only creates the feature config if it is missing
  - `sinyuk-cli config reset lora-dataset --force` backs up the current feature-home config and prompt template files, then writes the latest bundled templates

## Current Status

- Done:
  - feature-domain routing (`lora-dataset caption`, `lora-dataset crop`, bare domain help)
  - canonical runner split for `caption` and `crop`
  - dataset-local workspace contract with `_lora_dataset/`
  - automatic bootstrap for local prompt initialization
  - explicit `config reset lora-dataset --force` recovery path for stale feature-home templates
  - comprehensive feature-local test suite (scan, workspace, crop, caption, pipeline integration) — see [Tests](#tests) below
- Stable assumptions:
  - provider, scheduler, analysis, and crop options remain feature config
  - request tuning and caption assembly are dataset-local config
  - prompt is dataset-local, not YAML-configured
- Known gaps:
  - old `_meta/lora-dataset/` is only ignored for scanning; no auto-migration exists
  - stale feature-home files are recoverable through `config reset`, but there is still no in-place schema migration

## Tests

Test files live under `tests/` alongside the feature code. Shared fixtures and helpers are in `_test-helpers.ts`.

| File | What It Tests | Needs API Key |
|------|---------------|:---:|
| `provider.test.ts` | Request payload contract, assistant content extraction, JSON-to-caption fallback | No |
| `bootstrap.test.ts` | Prompt/config bootstrap copy and template-accepted startup behavior | ❌ |
| `scan.test.ts` | Image discovery, path generation, exclusion rules | ❌ |
| `workspace.test.ts` | Workspace paths, config validation, readApiKey, prompt loading | ❌ |
| `crop.test.ts` | Sharp-based crop output, skip-on-rerun, caption copy, abort signal | ❌ |
| `caption.e2e.test.ts` | Real VLM calls: requestCaption, runPreview, runBatch, skip-on-rerun | ✅ |
| `pipeline.e2e.test.ts` | Full caption→crop integration flow | ✅ |

```bash
# Run all local tests (no API key needed)
npx vitest run src/features/lora-dataset/tests/

# Run E2E tests with real API
TEST_LORA_API_KEY=sk-xxx npx vitest run src/features/lora-dataset/tests/
```

Test data lives under `tests/.local-data/` (gitignored). Two datasets:
- `test-1-image-1` - single image, used for unit-level pipeline validation
- `test-2-image-5` - 5 images, used for concurrency/batch/multi-image scenarios
- Runtime copies for test executions are materialized under `tests/.local-data/.runs/`, so generated `_lora_dataset/`, `raw/*.json`, caption `.txt`, and `dataset-crop-*` outputs stay inspectable after the test run

## Next Tasks

- Tighten summary/report UX for multi-spec crop runs

## Quick Start For Next LLM

- Start with [shared/workspace.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/shared/workspace.ts), [shared/bootstrap.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/shared/bootstrap.ts), and [shared/pipeline.ts](/D:/github/sinyuk-cli/src/features/lora-dataset/shared/pipeline.ts)
- Treat `caption/run.ts` and `crop/run.ts` as the canonical CLI execution path
- Treat store/screen pairs as thin interactive adapters, not the source of business rules
- Do not reintroduce `userPromptPath` into YAML config
- Do not write feature-private dataset state back into `_meta/`

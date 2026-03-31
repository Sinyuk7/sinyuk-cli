# sinyuk-cli

Config-driven interactive terminal workbench built with TypeScript, Clipanion, and Ink.

## Quick Start

```bash
npm install
npm run build
npm link
```

## Commands

```bash
# Initialize global config
sinyuk-cli init

# Open interactive workbench (ASCII banner + feature menu)
sinyuk-cli

# Show effective merged config
sinyuk-cli config show

# Back up and reset lora-dataset feature config and prompt template
sinyuk-cli config reset lora-dataset --force

# Run hello-world directly (feature + action contract)
sinyuk-cli hello-world run --path . --all
sinyuk-cli hello-world run --path . --file src/index.ts --dry-run

# Run lora-dataset directly
sinyuk-cli lora-dataset caption --path ./images
sinyuk-cli lora-dataset caption --path ./images --full --confirm-full
sinyuk-cli lora-dataset crop --path ./images
```

## Feature Docs

- `lora-dataset`: [src/features/lora-dataset/README.md](src/features/lora-dataset/README.md)

## Architecture & Development

- [AGENTS.md](AGENTS.md) — Project architecture, conventions, and anti-patterns
- [src/AGENTS.md](src/AGENTS.md) — Source code structure and feature development guide

## Notes

- `sinyuk-cli init` only creates missing files under `~/.sinyuk-cli/`. It does not overwrite existing user config.
- If `lora-dataset` feature-home files become stale after a schema or prompt-template change, use `sinyuk-cli config reset lora-dataset --force` to back up the old files and replace them with the latest bundled templates.
- `lora-dataset caption` now bootstraps missing dataset-local prompt/config files automatically. In the interactive flow, if the configured provider API key env var is missing, the CLI prompts for the token and continues after saving it.

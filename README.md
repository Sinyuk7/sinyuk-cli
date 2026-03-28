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

# Back up and reset lora-dataset feature config to the latest template
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

## Notes

- `sinyuk-cli init` only creates missing files under `~/.sinyuk-cli/`. It does not overwrite existing user config.
- If `lora-dataset` feature config becomes stale after a schema change, use `sinyuk-cli config reset lora-dataset --force` to back up the old file and replace it with the latest bundled template.

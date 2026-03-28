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

# Run hello-world directly (feature + action contract)
sinyuk-cli hello-world run --path . --all
sinyuk-cli hello-world run --path . --file src/index.ts --dry-run
```

## Feature Docs

- `lora-dataset`: [src/features/lora-dataset/README.md](src/features/lora-dataset/README.md)

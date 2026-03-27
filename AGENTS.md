# AGENTS.md

## Boot
- Read AGENTS.md
- Read MEMORY.md if exists
- Inspect only relevant files
- Prefer modify over create
- Keep changes minimal

## Priority
- User > MEMORY.md > AGENTS.md > existing code

## Mission
- Write correct, minimal, maintainable code
- Keep code clear, compact, explicit
- Fit existing structure, avoid over-design

## Non-negotiables
- Clarity > cleverness
- Explicit > implicit
- Small files > large files
- Deterministic > hidden magic
- Simple flow > deep helpers

## Code Rules
- Use clear names
- Keep control flow shallow
- Avoid unnecessary abstraction
- Avoid hidden state
- No silent fallback
- Separate logic from I/O
- Match existing good patterns

## File Rules
- Large file = bad design → split
- Split by responsibility
- Prefer small focused modules
- Target: file ≤ 300 LOC
- Target: function ≤ 50 LOC

## Function Rules
- One function = one clear job
- Call chain must be traceable
- No vague helpers unless clear
- Failure must be explicit

## Docstring (REQUIRED)
Format for core functions:
```
"""Map task snapshots into task list and detail view models.

INTENT: 将任务快照列表转换为仪表盘视图模型
INPUT: browser_state, snapshots, metrics_snapshot
OUTPUT: TaskDashboardViewModel
SIDE EFFECT: None
FAILURE: 返回空/默认状态的 TaskDashboardViewModel
"""
```

## Docstring Rules
- First line = short summary
- INTENT = purpose
- INPUT / OUTPUT = exact
- SIDE EFFECT = explicit or None
- FAILURE = concrete
- Explain role in call chain

## Side Effects
- Must be explicit
- Keep at boundaries
- No hidden DB / network / FS ops

## Types
- Prefer strong types
- Express business meaning
- Avoid weak containers

## Comments
- Short and useful
- Explain intent, not obvious code
- Remove stale comments

## Errors
- No silent failure
- Handle or surface
- Log when meaningful
- Default only if intentional

## State
- No hidden globals
- No implicit memory
- Explicit ownership only

## Done
- MEMORY.md read
- change minimal
- code clearer
- side effects explicit
- failure defined
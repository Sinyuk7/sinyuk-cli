# TODOS

Updated: 2026-03-27
Source: `/plan-eng-review` decisions (`14A`, `15A`, `16A`)

## TODO-001: Define Cross-Platform Release Matrix

**What:** Define supported distribution targets and CI publish matrix for `sinyuk-cli` artifacts.  
**Why:** Current plan has publish flow but no explicit platform/arch support contract, which can cause "works on my machine" releases.  
**Pros:** Predictable installs, fewer post-release surprises, clearer support policy.  
**Cons:** Adds release pipeline complexity and build verification cost.  
**Context:** The approved architecture already includes npm packaging and release steps. This TODO ensures distribution is explicit before broad usage. Start by documenting target OS/arch combinations and mapping each to build/publish jobs.  
**Depends on / blocked by:** Depends on initial package scaffold and first runnable CLI build.

## TODO-002: Add Interactive Fallback Decision Table

**What:** Write a fallback behavior matrix for direct commands vs interactive handoff (TTY/non-TTY, recoverable/non-recoverable errors, CI contexts).  
**Why:** Review decisions fixed the high-level rule, but implementation can still drift without concrete condition-action mapping.  
**Pros:** Consistent UX, predictable scripting behavior, fewer feature-level forks.  
**Cons:** Requires up-front policy detail and ongoing maintenance as edge cases expand.  
**Context:** Eng review selected "TTY + recoverable only" fallback. This TODO turns that into explicit implementation criteria and user-facing error messaging standards.  
**Depends on / blocked by:** Depends on feature entry contract and execution context plumbing.

## TODO-003: Define Test Expansion Gates

**What:** Define objective triggers for upgrading from minimal test baseline to broader integration/E2E coverage.  
**Why:** Current plan intentionally uses minimal tests in Phase 1; without predefined gates, expansion becomes ad-hoc and delayed.  
**Pros:** Preserves current minimal scope while preventing long-term under-testing drift.  
**Cons:** May trigger test work sooner than expected once complexity increases.  
**Context:** Current baseline is Vitest + execa with a small platform contract set and one CLI smoke test. This TODO defines when broader coverage becomes mandatory (for example: second side-effecting feature, remote operations, first regression incident).  
**Depends on / blocked by:** Depends on initial test harness setup and first feature implementation.

## TODO-004: Create DESIGN.md for Terminal Design Tokens

**What:** Create a project-level `DESIGN.md` defining terminal design tokens, state language, and reusable UI conventions.  
**Why:** Current design decisions are captured in a single feature plan; without a shared system file, future features may drift in color semantics, hierarchy, and interaction copy.  
**Pros:** Improves consistency across features, reduces design re-decision cost, and makes review/calibration faster.  
**Cons:** Requires upfront design documentation work before broader feature expansion.  
**Context:** `/plan-design-review` introduced interim tokens and hierarchy rules in the approved design doc; this TODO promotes them into a reusable project design source of truth.  
**Depends on / blocked by:** Depends on first feature implementation feedback to validate which tokens and patterns are truly reusable.

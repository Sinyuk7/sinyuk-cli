# CLAUDE.md

## gstack

### Web Browsing
**IMPORTANT:** Use gstack's `/browse` skill for ALL web browsing. NEVER use `mcp__claude-in-chrome__*` tools.

### Available Skills

The following gstack skills are available:

- `/office-hours` - Office hours consultation
- `/plan-ceo-review` - Plan CEO review
- `/plan-eng-review` - Plan engineering review
- `/plan-design-review` - Plan design review
- `/design-consultation` - Design consultation
- `/review` - Code review
- `/ship` - Ship code
- `/land-and-deploy` - Land and deploy changes
- `/canary` - Canary deployment
- `/benchmark` - Performance benchmarking
- `/browse` - Web browsing (primary browsing tool)
- `/qa` - Quality assurance
- `/qa-only` - QA only mode
- `/design-review` - Design review
- `/setup-browser-cookies` - Setup browser cookies
- `/setup-deploy` - Setup deployment
- `/retro` - Retrospective analysis
- `/investigate` - Investigation mode
- `/document-release` - Document release notes
- `/codex` - Code documentation
- `/cso` - Chief Security Officer mode
- `/careful` - Careful mode
- `/freeze` - Freeze changes
- `/guard` - Guard mode
- `/unfreeze` - Unfreeze changes
- `/gstack-upgrade` - Upgrade gstack

### Troubleshooting

If gstack skills are not working, run the following command to build binaries and register skills:

```bash
cd .claude/skills/gstack && ./setup
```

For Windows systems, you may need to manually set up gstack by:
1. Creating the `.claude/skills/gstack` directory structure
2. Copying gstack files from `~/.claude/skills/gstack`
3. Running the setup script with appropriate Windows-compatible commands

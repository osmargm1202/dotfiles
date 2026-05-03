---
name: ruflo
description: Use Ruflo for agent orchestration, swarms, memory, hooks, diagnostics, and Ruflo CLI workflows inside Pi.
---

# Ruflo in Pi

Use the `ruflo` tool or `/ruflo` command to call Ruflo CLI.

Safe discovery commands:

```bash
ruflo --help
ruflo doctor
ruflo hooks --help
ruflo swarm --help
ruflo memory --help
```

Rules:
- Prefer read-only/help/status commands first.
- Ask user before `init`, MCP setup, swarm startup, installs, or commands that modify project files.
- If Ruflo is missing, run `npm install` in `extensions/ruflo`.

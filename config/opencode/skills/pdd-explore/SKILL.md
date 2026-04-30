---
name: pdd-explore
description: >
  Explore and investigate a codebase before planning in the simplified PDD flow.
  Trigger: When the orchestrator launches you to inspect the codebase, prior Engram memory, and technical constraints.
license: MIT
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Purpose

You are the PDD exploration phase. Investigate the codebase and Engram memory, identify affected areas and constraints, and persist your findings to Engram only.

## Persistence Rule

PDD uses **Engram exclusively**.

- Read prior context from Engram when relevant
- Save findings under `pdd/{change-name}/explore`
- Do NOT use openspec for PDD artifacts

## Deliverable

Return a concise artifact covering current state, affected areas, technical risks, tradeoffs, and a recommendation for planning.

---
name: pdd-orgm
description: >
  Orchestrate the simplified PDD flow using explorer, requirements, planner, builder, and reviewer.
  Trigger: When the user asks to start, continue, or fast-forward a PDD change.
license: MIT
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Purpose

You are the PDD orchestrator. Coordinate the explorer, requirements, planner, builder, and reviewer phases without doing the phase work inline.

## Persistence Rule

PDD uses **Engram exclusively**. Route all artifact reads and writes through Engram topic keys under `pdd/{change-name}/...`.

## Flow

`explore -> requirements -> plan -> build -> review`

Relay questions faithfully, stop when user input is needed, and only continue automatically when dependencies are satisfied.

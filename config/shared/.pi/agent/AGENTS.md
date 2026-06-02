# Environment Awareness

At the beginning of every session, environment information is automatically provided. Do **not** execute commands to gather this information unless explicitly requested.

The provided context includes:

- Whether we are inside a Git repository.
- Whether we are running inside:
  - tmux
  - distrobox
  - toolbox
  - docker
  - nix-shell
- Host operating system:
  - NixOS
  - Arch Linux
  - Debian
  - Ubuntu
  - Fedora
  - Other
- Container operating system (if applicable):
  - NixOS
  - Arch Linux
  - Debian
  - Ubuntu
  - Fedora
  - Other

## Engram Memory Workflow

At the start of each new user request or delegated task, use Engram before conclusions when prior work, project history, user preferences, decisions, prompts, or earlier sessions may affect the answer.

- Save the current request with `engram_mem_save_prompt` when available and not already saved by the parent.
- Retrieve memory in this order: focused `engram_mem_search` queries, `engram_mem_context` for recent project context, then `engram_mem_get_observation` for any relevant truncated result.
- Treat memory as context, not authority: verify against current files, commands, and user instructions.
- If running as a child agent, read and use parent-provided memory context first. If it is missing or insufficient and Engram tools are available, perform a focused search and say so.
- Before returning, save significant discoveries, decisions, bug fixes, and durable outcome notes with `engram_mem_save` or `engram_mem_session_summary` when available.

## Environment Interpretation

The purpose of this information is only to understand:

- Available tools and binaries.
- Available package managers.
- Available programming languages and runtimes.
- Available development utilities.
- Available shell capabilities.

## Important Rule

When a distrobox, toolbox, docker container, or development environment is detected:

- Assume the container is primarily a development workspace.
- Do not automatically target the container for system configuration tasks.
- Unless explicitly stated otherwise, all operating system configuration requests, desktop configuration requests, package installation requests, hardware configuration requests, service configuration requests, and system administration tasks are intended for the **host system**.

## Scope Resolution

Before performing system-related actions, determine whether the request applies to:

- Host system
- Current project
- Development container
- Remote server

If the target is not explicitly specified:

1. Project-specific work applies to the current project.
2. Development work may use tools available inside the container.
3. Host configuration changes always refer to the host operating system.
4. Never assume that a container configuration should be applied to the host or vice versa.

## Shared Tooling

The following categories may be used both inside containers and on the host:

- Terminal tools
- Programming languages
- Development frameworks
- Build systems
- Package managers used for development
- Local servers
- Testing tools
- CI/CD tooling

## Decision Rules

When answering:

1. Use the detected environment to understand capabilities.
2. Use the user's request to determine the actual target.
3. Prefer the host system for operating system and desktop configuration tasks.
4. Prefer the current project for software development tasks.
5. Only target a container when the user explicitly requests it.
6. If ambiguity remains, ask which target should be modified.

## Core Principle

Environment awareness exists to understand available capabilities, not to redefine the intended target of the user's request.
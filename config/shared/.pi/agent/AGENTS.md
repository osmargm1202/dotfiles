# Global Pi instructions

## awareness
at start of any session verify the location we are working and the enviroment confirming:
	- if we are in a git project or not.
	- if we are in tmux, distrobox, tmux, nix-shell, toolbox, docker.
	- if we are in debian, archlinux, ubuntu, nixos.
	- if the distrobox/toolbox/docker is debian, archlinux, ubuntu, nixos, fedora.
	- if the requirement of the user is for de distrobox, docker or host


## RTK - Rust Token Killer

Use `rtk` as the default shell-command proxy to reduce output tokens.

### Rule

When calling the `bash` tool, prefix normal commands with `rtk`.

Examples:

```bash
rtk git status
rtk cargo test
rtk npm run build
rtk pytest -q
```

### Exceptions

Do not use `rtk` for shell syntax/control commands where it would break execution, for example:

```bash
cd /tmp && pwd
export PATH="$HOME/.cargo/bin:$PATH"
which rtk
command -v rtk
```

Use raw shell only when needed for compound commands, redirection, heredocs, shell builtins, or commands unsupported by `rtk`.

### Verification

```bash
rtk --version
rtk gain
which rtk
```

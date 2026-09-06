#!/usr/bin/env bash
set -euo pipefail
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../skills/irudd-plan" && pwd)"
skill_root="${1:-$HOME/.agents/skills}"
target="$skill_root/irudd-plan"
if [[ -e "$target" ]]; then
  printf 'Skill destination already exists: %s. Compare or move it before reinstalling.\n' "$target" >&2
  exit 1
fi
mkdir -p -- "$skill_root"
cp -R -- "$source_dir" "$target"
printf 'Installed %s. Restart Codex and run the MCP preflight before use.\n' "$target"

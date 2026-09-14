#!/usr/bin/env bash
# Guard hook for Claude Code — PreToolUse
#
# Blocks:
#   1. git push to main / origin main
#   2. Any --force or --force-with-lease push
#   3. Edits/writes to CLAUDE.md
#
# Adapted from autoDev's guard-push.sh / guard-docs.sh
# (github.com/eschnei/autodev, Apache-2.0) with attribution.

set -euo pipefail

# The hook receives JSON on stdin with tool_name and tool_input.
INPUT="$(cat)"

TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // empty')"

# --- Guard Bash commands ---
if [ "$TOOL_NAME" = "Bash" ]; then
  COMMAND="$(echo "$INPUT" | jq -r '.tool_input.command // empty')"

  # Block push to main
  if echo "$COMMAND" | grep -qE 'git\s+push\s.*(main|origin\s+main|origin\/main)'; then
    echo "Blocked: pushing to main is not allowed. Use a branch and open a PR instead." >&2
    exit 2
  fi

  # Block force push
  if echo "$COMMAND" | grep -qE 'git\s+push\s.*--force'; then
    echo "Blocked: force-pushing is not allowed. It rewrites history and can destroy work." >&2
    exit 2
  fi
fi

# --- Guard edits/writes to CLAUDE.md ---
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')"
  if echo "$FILE_PATH" | grep -qE '(^|/)CLAUDE\.md$'; then
    echo "Blocked: CLAUDE.md is project policy and must not be edited by AI sessions. Ask John to update it manually." >&2
    exit 2
  fi
fi

# Allow everything else: exit 0 with no output. (Printing JSON here is what
# caused the "Hook JSON output validation failed" spam — "allow" is not a
# valid decision value, and the pass-through case needs no output at all.)
exit 0

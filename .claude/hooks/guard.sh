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
    echo '{"decision": "block", "reason": "Blocked: pushing to main is not allowed. Use a branch and open a PR instead."}'
    exit 0
  fi

  # Block force push
  if echo "$COMMAND" | grep -qE 'git\s+push\s.*--force'; then
    echo '{"decision": "block", "reason": "Blocked: force-pushing is not allowed. It rewrites history and can destroy work."}'
    exit 0
  fi
fi

# --- Guard edits/writes to CLAUDE.md ---
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
  FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')"
  if echo "$FILE_PATH" | grep -qE '(^|/)CLAUDE\.md$'; then
    echo '{"decision": "block", "reason": "Blocked: CLAUDE.md is project policy and must not be edited by AI sessions. Ask John to update it manually."}'
    exit 0
  fi
fi

# Allow everything else
echo '{"decision": "allow"}'

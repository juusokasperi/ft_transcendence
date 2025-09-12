#!/usr/bin/env bash
# scripts/export-all.sh
# Run the export utilities in a sequence.
# - scripts/export-tsconfigs-json.mjs
# - scripts/export-packages-json.mjs
# - scripts/export-folders-to-txt.mjs
# - scripts/export-dockerfiles.mjs
# - scripts/export-makefile.mjs
# - scripts/export-extra-configs.mjs
# - scripts/export-nginx-default-conf.mjs
# - scripts/export-tree.sh
#
# Usage examples:
#   bash scripts/export-all.sh
#   bash scripts/export-all.sh --subdir apps --dirs "apps/api apps/web" --tree-args "-L 3"
#   bash scripts/export-all.sh --keep-going
#
# Flags:
#   --subdir <path>     Optional subdir to limit the snapshot scripts (tsconfigs, packages, dockerfiles).
#   --dirs "<list>"     Space-separated dirs for export-folders-to-txt.mjs (overrides defaults).
#   --tree-args "<str>" Extra args passed to scripts/export-tree.sh (quote if multiple).
#   --keep-going        Do not stop on first failure; continue and report at the end.
#   --no-color          Disable ANSI colors in output.
#
set -Eeuo pipefail

# -------- colors --------
if [[ "${1:-}" == "--no-color" ]]; then
  shift
  C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_RED=""; C_YELLOW=""; C_BLUE="";
else
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m';
fi

# -------- locate repo root (parent of scripts dir) --------
THIS_FILE="$(realpath -m "${BASH_SOURCE[0]}")"
SCRIPTS_DIR="$(dirname "$THIS_FILE")"
ROOT="$(realpath -m "$SCRIPTS_DIR/..")"

cd "$ROOT"

SUBDIR=""
DIRS_ARG=""
TREE_ARGS=""
KEEP_GOING=0

# Simple arg parser
while [[ $# -gt 0 ]]; do
  case "$1" in
    --subdir)
      SUBDIR="${2:-}"; shift 2;;
    --dirs)
      DIRS_ARG="${2:-}"; shift 2;;
    --tree-args)
      TREE_ARGS="${2:-}"; shift 2;;
    --keep-going)
      KEEP_GOING=1; shift;;
    --no-color)
      ;; # handled earlier
    *)
      echo "${C_YELLOW}warn${C_RESET}: unknown arg '${1}'. Ignored." >&2
      shift;;
  esac
done

# -------- helpers --------
ok()   { echo "${C_GREEN}[ok]${C_RESET} $*"; }
err()  { echo "${C_RED}[error]${C_RESET} $*" >&2; }
info() { echo "${C_BLUE}--${C_RESET} $*"; }

run_step() {
  local label="$1"; shift
  local start_ns end_ns secs rc
  start_ns=$(date +%s%N || true)
  info "${label}"
  if "$@"; then
    end_ns=$(date +%s%N || true)
    secs=$(python3 - <<'PY' "$start_ns" "$end_ns"
import sys
s=int(sys.argv[1]); e=int(sys.argv[2])
print(f"{(e-s)/1e9:.2f}")
PY
    )
    ok "${label} (${secs}s)"
    return 0
  else
    rc=$?
    err "${label} failed (exit ${rc})"
    if [[ "$KEEP_GOING" -eq 0 ]]; then
      exit "$rc"
    fi
    return "$rc"
  fi
}

NODE_BIN="${NODE_BIN:-node}"

# -------- steps --------
STEPS_FAILED=0

# 1) tsconfigs
if [[ -n "$SUBDIR" ]]; then
  run_step "export-tsconfigs-json.mjs" "$NODE_BIN" "scripts/export-tsconfigs-json.mjs" "$SUBDIR" || ((STEPS_FAILED++))
else
  run_step "export-tsconfigs-json.mjs" "$NODE_BIN" "scripts/export-tsconfigs-json.mjs" || ((STEPS_FAILED++))
fi

# 2) packages
if [[ -n "$SUBDIR" ]]; then
  run_step "export-packages-json.mjs" "$NODE_BIN" "scripts/export-packages-json.mjs" "$SUBDIR" || ((STEPS_FAILED++))
else
  run_step "export-packages-json.mjs" "$NODE_BIN" "scripts/export-packages-json.mjs" || ((STEPS_FAILED++))
fi

# 3) folders-to-txt
if [[ -n "$DIRS_ARG" ]]; then
  run_step "export-folders-to-txt.mjs" "$NODE_BIN" "scripts/export-folders-to-txt.mjs" --dirs "$DIRS_ARG" || ((STEPS_FAILED++))
else
  run_step "export-folders-to-txt.mjs" "$NODE_BIN" "scripts/export-folders-to-txt.mjs" || ((STEPS_FAILED++))
fi

# 4) dockerfiles (Dockerfile.dev + docker-compose.yml at root/subdir)
if [[ -n "$SUBDIR" ]]; then
  run_step "export-dockerfiles.mjs" "$NODE_BIN" "scripts/export-dockerfiles.mjs" "$SUBDIR" || ((STEPS_FAILED++))
else
  run_step "export-dockerfiles.mjs" "$NODE_BIN" "scripts/export-dockerfiles.mjs" || ((STEPS_FAILED++))
fi

# 5) makefile (root Makefile → scripts/output/makefile.txt)
run_step "export-makefile.mjs" "$NODE_BIN" "scripts/export-makefile.mjs" || ((STEPS_FAILED++))

# 6) extra-configs (root configs → scripts/output/extra-configs.txt or similar)
run_step "export-extra-configs.mjs" "$NODE_BIN" "scripts/export-extra-configs.mjs" || ((STEPS_FAILED++))

# 7) nginx/default.conf → scripts/output/nginx-default-conf.txt
if [[ -n "$SUBDIR" ]]; then
  run_step "export-nginx-default-conf.mjs" "$NODE_BIN" "scripts/export-nginx-default-conf.mjs" "$SUBDIR" || ((STEPS_FAILED++))
else
  run_step "export-nginx-default-conf.mjs" "$NODE_BIN" "scripts/export-nginx-default-conf.mjs" || ((STEPS_FAILED++))
fi

# 8) tree (shell)
if [[ -n "$TREE_ARGS" ]]; then
  # shellcheck disable=SC2086
  run_step "export-tree.sh" "bash" "scripts/export-tree.sh" ${TREE_ARGS} || ((STEPS_FAILED++))
else
  run_step "export-tree.sh" "bash" "scripts/export-tree.sh" || ((STEPS_FAILED++))
fi

if [[ "$STEPS_FAILED" -eq 0 ]]; then
  echo "${C_BOLD}${C_GREEN}All exports completed successfully.${C_RESET}"
else
  echo "${C_BOLD}${C_YELLOW}Completed with ${STEPS_FAILED} failed step(s).${C_RESET}"
  exit 1
fi

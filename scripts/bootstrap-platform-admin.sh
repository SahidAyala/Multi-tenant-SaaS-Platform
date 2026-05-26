#!/usr/bin/env bash
# ATLAS Platform — Initial Platform Administrator Bootstrap (shell wrapper)
#
# Delegates to scripts/bootstrap-platform-admin.ts via ts-node so we get
# tsconfig path-mapping (@atlas/shared-kernel, @atlas/event-contracts).
#
# Usage:
#   ./scripts/bootstrap-platform-admin.sh
#   (or: make bootstrap)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Refuse to run against production unless explicitly overridden.
if [[ "${NODE_ENV:-}" == "production" && "${BOOTSTRAP_ALLOW_PROD:-}" != "true" ]]; then
  echo "[bootstrap] Refusing to run with NODE_ENV=production. Set BOOTSTRAP_ALLOW_PROD=true to override." >&2
  exit 2
fi

# ts-node is a devDependency; resolve it via pnpm so we don't depend on a
# global install.
exec pnpm exec ts-node -r tsconfig-paths/register \
  "$SCRIPT_DIR/bootstrap-platform-admin.ts"

#!/bin/sh
# Run with sh, or make executable and launch directly.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
exec node "$SCRIPT_DIR/start.js" package

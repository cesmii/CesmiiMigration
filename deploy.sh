#!/usr/bin/env bash
#
# deploy.sh — Pull latest from git and rebuild the site if anything changed.
#
# Cron setup (run as the user who owns /var/www/cesmii):
#   crontab -e
#   */10 * * * * /var/www/cesmii/deploy.sh >> /var/log/cesmii-deploy.log 2>&1
#
# First-time setup on the server:
#   chmod +x /var/www/cesmii/deploy.sh
#   # Create the log file and give ownership to the deploy user:
#   sudo touch /var/log/cesmii-deploy.log
#   sudo chown $USER:$USER /var/log/cesmii-deploy.log

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="[$(date '+%Y-%m-%d %H:%M:%S')]"

cd "$DIR"

# Prevent overlapping runs if a build takes longer than the cron interval.
# Note: if the process is killed (SIGKILL), remove /tmp/cesmii-deploy.lock manually.
LOCK="/tmp/cesmii-deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
    echo "$STAMP Skipping — previous run still in progress."
    exit 0
fi
trap "rmdir '$LOCK'" EXIT

# Commit that out/ was last built from. Written only after a build succeeds, so an
# interrupted run leaves it stale and the next run rebuilds. Deciding from this rather
# than from "did HEAD move during this run" matters: a run that pulls and then dies
# before building would otherwise leave HEAD unchanged on every subsequent run, and
# the deploy would report "Already up to date" forever while serving the old build.
BUILD_STAMP="$DIR/.last-build"

git pull --quiet

AFTER=$(git rev-parse HEAD)

BUILT_FROM=""
if [ -f "$BUILD_STAMP" ]; then
    BUILT_FROM=$(cat "$BUILD_STAMP")
fi

if [ -d "$DIR/out" ] && [ "$BUILT_FROM" = "$AFTER" ]; then
    echo "$STAMP Already up to date (out/ built from ${AFTER:0:7})."
    exit 0
fi

if [ ! -d "$DIR/out" ]; then
    echo "$STAMP out/ is missing — building ${AFTER:0:7}."
elif [ -z "$BUILT_FROM" ]; then
    echo "$STAMP No build stamp — rebuilding ${AFTER:0:7}."
else
    echo "$STAMP out/ is stale (${BUILT_FROM:0:7} → ${AFTER:0:7}) — building."
fi

# Compare against what out/ was actually built from, falling back to HEAD when the
# stamp is missing or names a commit this checkout no longer has (e.g. after a force
# push), in which case only a missing node_modules triggers an install.
DIFF_BASE="$AFTER"
if [ -n "$BUILT_FROM" ] && git cat-file -e "${BUILT_FROM}^{commit}" 2>/dev/null; then
    DIFF_BASE="$BUILT_FROM"
fi

# Install dependencies if node_modules is missing or package-lock.json changed.
if [ ! -d "$DIR/node_modules" ] || git diff --name-only "$DIFF_BASE" "$AFTER" | grep -q 'package-lock\.json'; then
    echo "$STAMP Running npm install..."
    npm install --quiet
fi

# Locate node: check PATH first, then common nvm install location.
NODE=$(command -v node 2>/dev/null || true)
if [ -z "$NODE" ] && [ -d "$HOME/.nvm/versions/node" ]; then
    NODE=$(ls -v "$HOME/.nvm/versions/node/"*/bin/node 2>/dev/null | tail -1 || true)
fi
if [ -z "$NODE" ]; then
    echo "$STAMP ERROR: node not found. Ensure node is on PATH for the cron user."
    exit 1
fi

echo "$STAMP Clearing proxy cache..."
rm -f /tmp/cesmii_*.html /tmp/cesmii_*_title.txt

echo "$STAMP Building..."
"$NODE" build.js

# Record the built commit only now — see BUILD_STAMP above.
echo "$AFTER" > "$BUILD_STAMP"
echo "$STAMP Deploy complete (out/ built from ${AFTER:0:7})."

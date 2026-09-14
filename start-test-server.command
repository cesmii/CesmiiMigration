#!/usr/bin/env bash
#
# start-test-server.command — run the CESMII site on this Mac for testing.
#
# Double-click this file in Finder (or run it from Terminal). It will:
#   1. Install Homebrew, Node.js and PHP if they are missing
#   2. Install the project's dependencies
#   3. Build the site into out/
#   4. Start a local web server and open the site in your browser
#
# Press Ctrl+C in this window to stop the server.
#
# If macOS refuses to open it ("cannot be opened because it is from an
# unidentified developer"), right-click the file and choose Open instead.

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
URL="http://127.0.0.1:$PORT/"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n\n' "$*"; read -r -p "Press Return to close." _; exit 1; }

# --- 1. Homebrew -----------------------------------------------------------
# Homebrew installs to different places on Apple Silicon and Intel Macs.
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$b" ] && eval "$("$b" shellenv)" && break
done

if ! command -v brew >/dev/null; then
    say "Installing Homebrew (this asks for your Mac password and takes a few minutes)"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
        || fail "Homebrew did not install. See https://brew.sh and try again."
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        [ -x "$b" ] && eval "$("$b" shellenv)" && break
    done
fi

# --- 2. Node.js and PHP ----------------------------------------------------
if ! command -v node >/dev/null; then
    say "Installing Node.js"
    brew install node || fail "Node.js did not install."
fi

if ! command -v php >/dev/null; then
    say "Installing PHP"
    brew install php || fail "PHP did not install."
fi

# (Capture first: piping straight into grep -q trips pipefail when grep exits early.)
PHP_MODULES="$(php -m)"
for ext in curl dom; do
    grep -qi "^$ext$" <<< "$PHP_MODULES" || fail "PHP is missing the '$ext' extension. Run: brew reinstall php"
done

# --- 3. Project dependencies -----------------------------------------------
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
    say "Installing project dependencies"
    npm install --quiet --no-fund --no-audit || fail "npm install failed."
fi

# --- 4. Build --------------------------------------------------------------
say "Building the site"
node build.js || fail "The build failed. See the messages above."

# --- 5. Serve --------------------------------------------------------------
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port $PORT is already in use. Is the test server already running? Close that window first."
fi

say "Starting the test server at $URL"
echo "    Pages load their content from HubSpot, so the first visit to each page takes a second."
echo "    Site search does not work locally. Everything else should."
echo "    Site map viewer: ${URL}sitemap"
echo "    Press Ctrl+C to stop."
echo

( sleep 1.5; open "$URL" ) &
trap 'echo; echo "Server stopped."' EXIT
php -S "127.0.0.1:$PORT" -t out tools/router.php

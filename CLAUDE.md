# CESMII Website — Notes for Claude

This file is read by Claude Code at session start. It covers architecture decisions,
current state, and things that aren't obvious from reading the code alone. Read
"People and environments" first: it tells you who you are probably talking to.

---

## People and environments

**The site owner** is non-technical and works on a Mac. She owns the content and the
navigation. Her tools are HubSpot (page content), Gloomaps (the site map), and the
test server started by double-clicking `start-test-server.command`. She does not use
the terminal by choice. When helping her:

- Explain in plain language. Say "the menu" not "the nav tree", "the site map file"
  not "gloomap.xml" unless she needs to find it in Finder.
- Do the git work for her (stage, commit, push) and tell her what you did. Do not ask
  her to run git commands. The branch is `main`; pushing to it deploys (see Deployment).
- If she needs to run something, the only thing she should have to do is double-click
  `start-test-server.command`. If that fails, read its Terminal output for her.
- Content problems (wrong text, placeholder "lorem ipsum", broken images inside a page)
  are fixed in HubSpot, not here. Tell her which HubSpot page: debug mode shows the URL.
- Menu problems are fixed in Gloomaps and then by committing the exported XML.
- Anything in `lib/`, `public/proxy.php`, `build.js`, nginx, or the server is developer
  territory. Make the change if it is small and safe, and say clearly that a developer
  should review it.

**The developer** (the other regular user of this repo) handles the server, proxy.php,
and the build. Notes for them are in the rest of this file.

**Environments**

| | Where | Notes |
|---|---|---|
| Her Mac | `start-test-server.command` → http://127.0.0.1:8080/ | Real HubSpot content, PHP 8.5 via Homebrew. Site search does not work locally. |
| Staging | http://migration.cesmii.net (HTTP only, no cert yet) | Repo at `/home/cesmii/apps/CesmiiMigration`, PHP 8.1, deploys via `deploy.sh`. |
| Production | cesmii.org, not cut over yet | `nginx-example.config` is written for it: `/var/www/cesmii`, PHP 8.3, HTTPS. Adjust paths and PHP version when copying to another box. |
| Git | github.com/cesmii/CesmiiMigration | The old Chad-NextStep fork is dead. |
| HubSpot site | 43818189.hs-sites.com | Plus membershiphub.cesmii.org (HubSpot memberships) and connect.cesmii.org (HubSpot landing pages). www.cesmii.org is the **old** site and must not be linked from the menu. |

---

## How the site owner changes the menu

1. Edit the map in Gloomaps. A box's text is the label, then a second line starting
   with `#` holding the HubSpot page URL:
   ```
   Our Story
   #https://43818189.hs-sites.com/our-story
   ```
   No `#` line means "in the menu, but not linked yet" — it shows **red** on the site.
   `http://` is upgraded to `https://` automatically. Gloomaps drops `&` from labels;
   the parser turns the resulting double space back into ` & `.
2. Export the XML from Gloomaps and replace `gloomap.xml` in the repo.
3. Double-click `start-test-server.command`, check the menu, and check `/sitemap`,
   which lists every box, what it links to, and which ones are red.
4. Commit and push `gloomap.xml` to `main`. Staging rebuilds itself within ten minutes
   if the cron job is installed; otherwise a developer runs `deploy.sh` on the server.

Only two menu levels render: top-level items and one dropdown beneath each. Deeper
boxes are planning structure only; they produce no menu entry even with a URL. `/sitemap`
marks them "not in menu". The four dropdown headers (About, Membership, Our Focus,
Impact) are not links and are not red; that is by design.

**Symptoms she may report, and what they mean**

| She says | Cause | Fix |
|---|---|---|
| A menu item is red | Box has no `#` URL line in Gloomaps | Add the URL in Gloomaps, export, commit |
| A menu item goes to a "Page Not Found" | URL is on a host proxy.php does not allow, or the HubSpot page does not exist | Check the URL in `/sitemap`; fix in Gloomaps or HubSpot |
| Page says "Content temporarily unavailable" | HubSpot did not respond and nothing was cached | Retry; if persistent, a developer checks the server |
| Page says "Disallowed URL" | URL host is not in `HS_ALLOWED_HOSTS` in proxy.php | Use a HubSpot URL, or a developer adds the host |
| Lorem ipsum, "Facebook case study", empty links | HubSpot template placeholders never filled in | Fix the page in HubSpot |
| Her HubSpot edit does not show | Caching (currently off, see below), or the browser | Reload; if caching is on, wait the TTL or redeploy |
| Search does nothing on her Mac | The `/_hcms/` proxy exists only in nginx | Expected locally; works on staging |
| "Port 8080 is already in use" | The test server is already running in another window | Close that window, double-click again |
| macOS refuses to open the script | Gatekeeper on a downloaded file | Right-click the file, choose Open |
| Which part is HubSpot? | | Add `?debug=true` to the address: HubSpot content gets a dotted red outline labelled with its URL; rewritten links get a dotted red underline and a tooltip |

---

## Architecture in one sentence

`gloomap.xml` → `build.js` → `out/` (PHP page shells + static assets) → nginx serves them.

---

## How content loading works

All page content lives in HubSpot. A gloomap entry with a `#https://...` URL becomes
`out/{path}/index.php`, which nginx passes to PHP-FPM. That file calls `hs_fetch()` in
`public/proxy.php`, which fetches the page **server-side at request time**, strips its
chrome, and echoes the body into our shell. The URL host must be in `HS_ALLOWED_HOSTS`
in proxy.php (the HubSpot site plus membershiphub.cesmii.org and connect.cesmii.org).

Gloomap entries with **no URL** appear in the nav but produce **no output file**. They
are nav structure only — placeholders for content not yet linked.

Sections with many pages (`/news/*`, `/bio/*`, `/events/*`, …) are not in the gloomap.
Their path prefixes are listed in `DYNAMIC_SECTIONS` in `build.js`. nginx falls through
to `out/dynamic.php` for any unmatched path, and that handler maps the request path onto
the same path on HubSpot. This is how the News listing, its tag pages, and posts load.
The Impact nav items are just gloomap entries whose URLs are `/news/tag/...` pages.

`NAV_LINK_OVERRIDES` in `lib/shell-renderer.js` makes a nav item link somewhere other
than its own generated path. Use it sparingly; prefer fixing the gloomap.

---

## Key files

| File | What a developer touches |
|------|--------------------------|
| `gloomap.xml` | Site map and nav — edit in Gloomaps, export, commit |
| `build.js` | Build orchestrator — reads gloomap, writes `out/` |
| `lib/gloomap-parser.js` | Parses gloomap XML into a nav tree |
| `lib/shell-renderer.js` | Renders the HTML/PHP shell for each page |
| `public/proxy.php` | PHP function library — `hs_fetch()` fetches and strips HubSpot pages |
| `public/css/theme-bridge.css` | All chrome styles (header, nav, footer, content areas) |
| `public/js/app.js` | Client-side nav interactivity (mobile toggle, dropdowns, scroll) |
| `nginx-example.config` | Reference nginx config for production (HTTP redirect + HTTPS) |
| `deploy.sh` | Cron-driven deploy script — git pull + conditional rebuild |
| `tools/gloomap-viewer.html` | Site map viewer; the build copies it to `out/sitemap/` and `gloomap.xml` to `out/` |
| `tools/router.php` | Router for PHP's built-in server so `npm run dev` behaves like nginx |
| `start-test-server.command` | Double-click script for non-technical Mac users: installs deps, builds, serves |

---

## Build behaviour

- `out/` is wiped and regenerated on every build — never edit files there directly.
- `public/` is copied to `out/` first, then gloomap pages are written on top.
- Linked entries → `out/{path}/index.php`
- Entries without URLs → nothing written, but the entry still appears in the nav.
- Homepage → `out/index.php` from the root box's URL (or a placeholder `index.html` if unset).
- `out/404.html`, `out/dynamic.php`, `out/sitemap/index.html`, and `out/gloomap.xml` are always written.
- The header, nav, and footer markup lives in one place: `renderPage()` in
  `lib/shell-renderer.js`. Both the build-time shell and `dynamic.php` use it.
- CSS and JS URLs carry a `?v=<build timestamp>` so browsers refetch after a deploy.

---

## Server requirements

- **OS:** Ubuntu 24.04 LTS
- **nginx** with PHP-FPM 8.1 or newer, with the `curl` and `xml` extensions
  (staging runs `php8.1-fpm`; `nginx-example.config` names the 8.3 socket, so edit it)
- **Node.js** for the build (only needed at build time, not at runtime)
- The full repo is checked out on the server (not just `out/`). Staging uses
  `/home/cesmii/apps/CesmiiMigration`; the example nginx config assumes `/var/www/cesmii`.
- nginx serves `out/` as the document root — see `nginx-example.config`
- The nginx and PHP-FPM user (`www-data`) must be able to traverse every directory on
  the path to `out/`. Home directories are 750 by default: `chmod o+x` each level, or
  the log shows `stat() ... Permission denied` and pages return "File not found".

---

## Deployment

`deploy.sh` is the deploy mechanism — intended to run from cron:

```
*/10 * * * * /var/www/cesmii/deploy.sh >> /var/log/cesmii-deploy.log 2>&1
```

It: pulls from git, compares HEAD with `.last-build` (the commit `out/` was last built
from), runs `npm install` if `node_modules/` is missing or `package-lock.json` changed,
then runs `build.js` and writes the stamp. Also builds if `out/` is missing. It does not
delete cache files; a build invalidates them (see PHP proxy details). Run it by hand on
the server to deploy immediately. Paths in the cron line above are for production;
staging's repo lives under `/home/cesmii/apps/`.

---

## PHP proxy details

`proxy.php` is a function library, not a web endpoint. Direct access is blocked by
nginx (`location = /proxy.php { return 404; }`).

Generated `index.php` pages include it like this:
```php
require_once $_SERVER['DOCUMENT_ROOT'] . '/proxy.php';
echo hs_fetch('https://43818189.hs-sites.com/page-slug');
```

`hs_fetch()` caches results in the system temp dir as `cesmii_<md5>.html` for
`HS_CACHE_TTL` seconds, the flag at the top of proxy.php. It is currently `0`, meaning no
caching: every request fetches live so content editors always see their latest HubSpot
changes. Raise it (e.g. 900) once the site is stable.
A cache entry is also treated as stale if it is older than `out/proxy.php`, which every
build rewrites, so a deploy invalidates the cache without deleting anything. That matters
because PHP-FPM owns the files and the deploy user cannot remove them from sticky `/tmp`.
On upstream failure it serves stale cache rather than an error. To force a refresh
without a code change, run `node build.js` (or `deploy.sh`).

Content extraction (`_hs_extract()`), in order:
1. Fetches every `<link rel="stylesheet">` the page references and collects inline
   `<style>` blocks. `_hs_scope_css()` prefixes every selector with `.content-proxy`
   and the result is emitted as one `<style>` block ahead of the content. This keeps
   HubSpot layouts intact without letting HubSpot's CSS touch our header/nav/footer.
   It is the most involved code in the repo.
2. Strips `<style>`, `<link>`, `<noscript>`, `<header>`, `<footer>`, `<nav>`, `<iframe>`,
   HubSpot's built-in blog tag filter, and third-party `<script>`s (HubSpot-hosted and
   `HS_ALLOWED_SCRIPT_HOSTS` scripts are kept). Prefers `<main>`, falls back to `<body>`.
3. `_hs_rewrite_urls()` rewrites links: absolute HubSpot page links become local paths,
   `HS_PATH_MAP` remaps flat HubSpot paths onto the nav hierarchy, root-relative `src`
   and asset `href`s become absolute HubSpot URLs. It also patches known upstream
   content bugs (unrendered HubL link fields, newsletter filter links) — each is
   commented inline with why.

`hs_last_status()` reports the upstream HTTP status of the last fetch so `dynamic.php`
can return a real 404 for missing pages. The page `<title>` is cached in a `_title.txt`
sidecar; only `dynamic.php` reads it (gloomap pages get their title from the nav label).
If extraction quality is wrong for a specific page, adjust `_hs_extract()` in proxy.php.

---

## Debug mode

Append `?debug=true` to any page URL. `initDebug()` in `public/js/app.js` adds a `debug`
class to `<html>`, which outlines proxied HubSpot content with a dotted red border and a
red tag showing the URL it was fetched from (the `data-source` attribute on
`.content-proxy`, set at build time for gloomap pages and at request time in `dynamic.php`).
Links whose href the proxy rewrote carry `data-hs-original` (set in `_hs_rewrite_urls()`,
and by `app.js` for links HubSpot injects client-side); in debug mode they get a dotted
red underline and a tooltip with the original URL. The query string is the only switch:
same-site links get `?debug=true` appended at click time so it follows you around, and
removing the parameter from the URL turns it off. `dynamic.php` strips the `debug` parameter
before building the upstream URL so it never reaches HubSpot or the cache key. Add other
debug-only behaviour under the same class/function.

---

## Things to watch for

- **HubSpot page caching is disabled.** `HS_CACHE_TTL` in `public/proxy.php` is `0`, so
  every request fetches from HubSpot. This is deliberate during the migration so content
  editors see changes immediately. It costs roughly half a second per page and hits
  HubSpot on every visit. Before launch, or if HubSpot rate-limits us, set it to a value
  in seconds (900 is a sensible start). Remember that once it is on, a HubSpot edit can
  take up to that long to appear, and a deploy always clears the cache.

- **`add_header` inheritance in nginx:** a `location` block that defines any `add_header`
  directive does NOT inherit `add_header` from the outer server block. Security headers
  are therefore repeated in every location block that sets headers. This is intentional.
- **PHP pages need PHP-FPM running** — if pages return 502, check `systemctl status php8.1-fpm`
  (8.3 on production).
- **Stale deploy lock** — if deploy.sh was killed mid-run, remove `/tmp/cesmii-deploy.lock`
  manually before the next run.
- **srcset not rewritten** — `hs_rewrite_urls()` handles `src` and `href` but not `srcset`.
  If responsive images break on a proxied page, add a srcset rewrite pass in proxy.php.

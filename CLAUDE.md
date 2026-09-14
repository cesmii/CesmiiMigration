# CESMII Website — Developer Notes for Claude

This file is read by Claude Code at session start. It covers architecture decisions,
current state, and things that aren't obvious from reading the code alone.

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
| `tools/gloomap-viewer.html` | Dev tool: renders `gloomap.xml` as a tree showing what's linked (dev server `/sitemap`) |
| `tools/router.php` | Router for PHP's built-in server so `npm run dev` behaves like nginx |
| `start-test-server.command` | Double-click script for non-technical Mac users: installs deps, builds, serves |

---

## Build behaviour

- `out/` is wiped and regenerated on every build — never edit files there directly.
- `public/` is copied to `out/` first, then gloomap pages are written on top.
- Linked entries → `out/{path}/index.php`
- Entries without URLs → nothing written, but the entry still appears in the nav.
- Homepage → `out/index.php` from the root box's URL (or a placeholder `index.html` if unset).
- `out/404.html` and `out/dynamic.php` are always written.
- The header, nav, and footer markup lives in one place: `renderPage()` in
  `lib/shell-renderer.js`. Both the build-time shell and `dynamic.php` use it.
- CSS and JS URLs carry a `?v=<build timestamp>` so browsers refetch after a deploy.

---

## Server requirements

- **OS:** Ubuntu 24.04 LTS
- **nginx** with PHP-FPM: `php8.3-fpm`, `php8.3-curl`, `php8.3-xml`
- **Node.js** for the build (only needed at build time, not at runtime)
- The full repo is checked out on the server at `/var/www/cesmii/` (not just `out/`)
- nginx serves `out/` as the document root — see `nginx-example.config`

---

## Deployment

`deploy.sh` is the deploy mechanism — intended to run from cron:

```
*/10 * * * * /var/www/cesmii/deploy.sh >> /var/log/cesmii-deploy.log 2>&1
```

It: pulls from git, detects changes via HEAD hash comparison, runs `npm install` if
`node_modules/` is missing or `package-lock.json` changed, then runs `build.js`.
Also builds on first run if `out/` doesn't exist yet (fresh clone).

---

## PHP proxy details

`proxy.php` is a function library, not a web endpoint. Direct access is blocked by
nginx (`location = /proxy.php { return 404; }`).

Generated `index.php` pages include it like this:
```php
require_once $_SERVER['DOCUMENT_ROOT'] . '/proxy.php';
echo hs_fetch('https://43818189.hs-sites.com/page-slug');
```

`hs_fetch()` caches results in `/tmp/cesmii_<md5>.html` for 1 hour. On upstream
failure it serves stale cache rather than an error. Clear cache by deleting those files.

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

- **`add_header` inheritance in nginx:** a `location` block that defines any `add_header`
  directive does NOT inherit `add_header` from the outer server block. Security headers
  are therefore repeated in every location block that sets headers. This is intentional.
- **PHP pages need PHP-FPM running** — if pages return 502, check `systemctl status php8.3-fpm`.
- **Stale deploy lock** — if deploy.sh was killed mid-run, remove `/tmp/cesmii-deploy.lock`
  manually before the next run.
- **srcset not rewritten** — `hs_rewrite_urls()` handles `src` and `href` but not `srcset`.
  If responsive images break on a proxied page, add a srcset rewrite pass in proxy.php.

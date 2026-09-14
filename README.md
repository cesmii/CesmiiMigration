# CESMII Website — Architecture & Design Overview

*Written for a semi-technical Product Manager.*

---

## What this project does

This repository controls the **navigation shell** of cesmii.org — the top bar, header, main nav, and footer that appear on every page. It does not contain the page content itself; that lives in HubSpot, where the content team works.

When a visitor loads a page on cesmii.org, they get:
- Our chrome (nav, header, footer) — rendered from this repo
- The page content — fetched from HubSpot and injected directly into the shell

This separation means the content team keeps full control over page layouts, design, and campaigns in HubSpot, while our server owns the navigation and brand chrome.

---

## How the site map works

The file **`gloomap.xml`** is the single source of truth for the site's navigation structure. A non-technical person designs the site map visually in [Gloomaps](https://www.gloomaps.com), exports it as XML, and commits the file to this repo. Running the build generates the entire site from it.

Each box in the Gloomaps diagram becomes a nav item. To attach a URL to a nav item, the box's label uses a two-line format:

```
Page Label
#https://page-url-here
```

The URL is a page on the HubSpot site, for example `#https://43818189.hs-sites.com/our-story`. It is fetched server-side and injected into the shell. A few other CESMII hosts (the membership hub, connect.cesmii.org) are allowed too.

If a box has no URL line, it appears in the navigation as a label but no page is generated for it. This lets you build out the navigation structure ahead of the content — placeholder items show in dropdown menus in a dimmed style.

---

## How a change gets published

1. A non-technical person edits the site map in Gloomaps, adding or rearranging boxes and `#url` lines
2. They export the XML and commit `gloomap.xml` to this repo
3. The web server picks up the change automatically — a cron job runs `deploy.sh` every 10 minutes, pulls from git, and rebuilds if anything changed

There is no Node.js server running in production. The build produces HTML and PHP files that nginx serves directly. This is fast, simple, and cheap to host.

---

## Content lives in HubSpot

The content team creates and manages every page in HubSpot's page editor. When a visitor loads a page, our server fetches the HubSpot content, strips HubSpot's own header, footer, and nav, and injects the body into our shell. HubSpot's page CSS is kept but scoped so it cannot restyle our chrome.

The homepage is a HubSpot page too. It is referenced on the root box in `gloomap.xml`:

```
cesmii.org
#https://43818189.hs-sites.com/index
```

**News, events, bios, and other multi-page sections** are not listed in the gloomap page by page. A short list of path prefixes in `build.js` (`/news`, `/events`, `/bio`, …) is handed to a catch-all handler that proxies whatever HubSpot has at the same path. The Impact menu items are ordinary gloomap entries that point at News tag pages, so they act as tag filters on the news blog.

---

## Key files

| File | Purpose |
|------|---------|
| `gloomap.xml` | Site map and nav source of truth — edit this to change navigation |
| `build.js` | Build script — reads gloomap, generates `out/` |
| `public/proxy.php` | Server-side HubSpot content proxy (included by generated PHP pages) |
| `public/css/theme-bridge.css` | All styles for the nav shell (header, footer, chrome) |
| `public/js/app.js` | Interactivity for the shell (mobile nav, dropdowns, scroll effects) |
| `public/images/` | Site logo |
| `nginx-example.config` | Reference nginx config for production deployment |
| `deploy.sh` | Cron-driven deploy script — git pull + conditional rebuild |
| `tools/gloomap-viewer.html` | Site map viewer — see below |
| `TODO.md` | Deferred tasks and known pre-launch items |
| `out/` | Generated site — served by nginx (not committed to git) |

---

## Known limitations and deferred work

See **`TODO.md`** for the full list.

---

## Build and deploy

### Testing the site on a Mac (no developer tools needed)

1. Get the repo onto the Mac: either **Code → Download ZIP** on GitHub and unzip it, or `git clone` it.
2. Open the folder in Finder and double-click **`start-test-server.command`**.
   If macOS says it cannot be opened, right-click it and choose **Open**.
3. A Terminal window opens, installs anything missing (Homebrew, Node.js, PHP — this asks for your Mac password the first time), builds the site, and opens it at http://127.0.0.1:8080/.
4. Leave that window open while testing. Press **Ctrl+C** in it, or close it, to stop.

Pages pull their content live from HubSpot, so the first load of each page takes a moment. Site search is the one thing that does not work locally.

Add `?debug=true` to any page address (for example http://127.0.0.1:8080/?debug=true) to outline the HubSpot content in dotted red, labelled with the HubSpot address it was fetched from, so it is clear what comes from HubSpot and what is the site framework. Links the framework has rewritten get a dotted red underline; hover one to see where it originally pointed. It follows you as you click around the site. To turn it off, remove `?debug=true` from the address. This works on the live site too.

http://127.0.0.1:8080/sitemap shows the site map: every nav entry, the page it points to, and which entries are still unlinked.

To pick up a new `gloomap.xml` or code change, stop the server and double-click the script again.

### Local development (developers)

```bash
npm install       # first time only
npm run dev       # build + serve at http://127.0.0.1:8080/ with PHP, so HubSpot content loads
```

`tools/router.php` makes PHP's built-in server follow the same rules as nginx: `index.php`, then `index.html`, then `dynamic.php`. It does not proxy `/_hcms/`, so HubSpot search results do not work locally.

### Checking the site map

Open `/sitemap` on the dev server or on the live site. It shows `gloomap.xml` as a tree: the path each entry will get, the HubSpot page it proxies, and which entries are still unlinked. You can also drop a fresh Gloomaps export onto the page to preview it before committing. The page and the XML it reads are copied into `out/` by the build, so they are public on the live site.

### Production deployment

The server runs `deploy.sh` via cron every 10 minutes. Committing to `main` is all that's needed — the server picks it up automatically.

To trigger an immediate deploy, SSH into the server and run:

```bash
/var/www/cesmii/deploy.sh
```

Logs are at `/var/log/cesmii-deploy.log`.

### What lives on the server

The full repo is checked out at `/var/www/cesmii/`. nginx serves the `out/` subdirectory as the document root. `deploy.sh` runs `build.js` in place — there is no separate upload step.

---

## Roles and responsibilities

| Area | Owner |
|------|-------|
| Page content, layouts, campaigns | Content team (HubSpot) |
| Site navigation structure | Gloomaps → `gloomap.xml` |
| Chrome styles (header, footer) | This repo |
| Build and deployment | Developer |

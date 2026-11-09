# TODO — Deferred Tasks

## Pre-Launch

### Tune HubSpot content extraction
**Priority: Medium — verify extraction quality on each linked page**

`public/proxy.php` strips `<header>`, `<footer>`, `<nav>`, and third-party scripts, inlines
and scopes HubSpot's CSS, then extracts `<main>` (falling back to `<body>`). This works
for standard HubSpot templates but may need adjustment as real pages are linked:

- If HubSpot doesn't use a semantic `<main>`, the body fallback may include unwanted wrapper
  divs. Inspect the rendered output and add more specific element removal in `_hs_extract()`
  if needed.
- HubSpot `srcset` attributes on `<img>` are not yet rewritten to absolute URLs — only `src`
  and `href` are handled. Add a `srcset` rewrite pass if responsive images break.
- `HS_CACHE_TTL` at the top of proxy.php is `0` (no caching) during the migration so
  HubSpot edits show immediately. Raise it after launch; every build also invalidates
  the cache, since entries older than `out/proxy.php` are treated as stale.

### Link the rest of the nav
Membership, most of Our Focus, and RFP / Project Submissions still have no HubSpot URL
and render as unlinked labels. As HubSpot pages are published, add their `#https://...`
lines to the gloomap so the entries become navigable.

### SM Roadmapping links to other connect.cesmii.org pages
**Waiting on marketing.** The SM Roadmapping page (`/our-focus/sm-roadmapping`, from
connect.cesmii.org) links to two connect.cesmii.org pages that aren't in our nav, so
the proxy turns them into local paths that 404:
- "You can view all certified professionals **here**" (FAQ answer to "What is a CESMII
  Certified Roadmap Professional?") → `/certified-smart-manufacturing-roadmap-professionals`
- "View Sample Questions" button → `/sm-assessment-help#business-practices-assessment-preview`

Options: add these pages to the gloomap, or have proxy.php leave links on
connect.cesmii.org / membershiphub pointing at their own site unless the page is in the nav.

### Upstream content fixes that would let proxy.php shrink
One block in `_hs_rewrite_urls()` exists only to patch HubSpot content and can be
deleted once the source is fixed:
- Unrendered HubL link fields (`href="{type=EXTERNAL, …}"`) — fix the module template
  to output `{{ module.link.href }}`.

### Re-export from Gloomaps
Recent nav changes were made by hand-editing `gloomap.xml`. The Gloomaps diagram is now
behind the file. Either bring the diagram up to date and re-export, or accept the XML file
as the source of truth going forward.

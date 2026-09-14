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
- The 1-hour disk cache (`HS_CACHE_TTL`) is invalidated by every build, since entries
  older than `out/proxy.php` are treated as stale.

### Link the rest of the nav
Membership, most of Our Focus, and RFP / Project Submissions still have no HubSpot URL
and render as unlinked labels. As HubSpot pages are published, add their `#https://...`
lines to the gloomap so the entries become navigable.

### Upstream content fixes that would let proxy.php shrink
Two blocks in `_hs_rewrite_urls()` exist only to patch HubSpot content and can be
deleted once the source is fixed:
- Unrendered HubL link fields (`href="{type=EXTERNAL, …}"`) — fix the module template
  to output `{{ module.link.href }}`.
- Newsletter filter links pointing at the wrong blog — fix the shared filter bar markup.

### Re-export from Gloomaps
Recent nav changes were made by hand-editing `gloomap.xml`. The Gloomaps diagram is now
behind the file. Either bring the diagram up to date and re-export, or accept the XML file
as the source of truth going forward.

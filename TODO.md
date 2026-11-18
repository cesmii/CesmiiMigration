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
- Check interactive modules (FAQ accordions, tabs, sliders) actually work, not just render.
  Their JS is a separate script file; if the proxy drops it the markup still shows but
  clicks do nothing. Example: the FAQs on SM Roadmapping and Membership Hub were dead until
  scripts from the connect/membershiphub custom domains were allowed.

### Page speed / caching
**Priority: High — decide before cesmii.org launch**

Every page currently fetches HubSpot live (the HTML plus each stylesheet), so pages
take 1–3s. Options, in suggested order:

- **Cloudflare Cache Rule** for page HTML with a short edge TTL (5–15 min). The rule
  must override origin headers, because nginx sends `Cache-Control: no-store` on all
  PHP responses (`location ~ \.php$` and `@dynamic`). Alternatively, change that header
  to `public, s-maxage=600`. Exclude `/_hcms/*`, `/hs-search-results` and `?debug=true`.
  Agree with editors on cache delay vs purging Cloudflare after publishing.
- **Merge `perf/cache-stylesheets`**: caches HubSpot CSS on the server for a day
  (~1–2s saved per page in local testing).
- **`HS_CACHE_TTL`** at the top of proxy.php is `0` (off) so HubSpot edits show
  immediately. Server-side page cache; every build invalidates it, since entries older
  than `out/proxy.php` are treated as stale. Probably unnecessary if Cloudflare caches
  pages, and two cache layers make "why isn't my edit showing" harder to answer.

Our own CSS/JS/images already get a 1-year cache with `?v=` cache-busting.

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

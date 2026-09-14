/**
 * shell-renderer.js
 *
 * Renders the full HTML page shell: top-bar, header with server-side nav,
 * main content area (HubSpot content fetched by proxy.php), and footer.
 * No client-side HTML injection — everything is in the initial response.
 *
 * One template (renderPage) serves both the build-time shell for gloomap pages
 * and the generated dynamic.php handler; the latter passes PHP echo snippets
 * for the title, year, and content slots.
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Nav HTML builders ---

// Nav items that should link to a different path than their own localPath.
// Do not use this to point at the old www.cesmii.org site: un-migrated content
// must stay visibly unlinked (red in the menu) until it exists in HubSpot.
const NAV_LINK_OVERRIDES = {
  '/membership/become-a-member': '/membership/membership-hub',
};

function buildDropdownItem(child, currentPath) {
  const override = NAV_LINK_OVERRIDES[child.localPath];
  const href = override || child.localPath;
  const isActive = currentPath === child.localPath ||
    currentPath.startsWith(child.localPath + '/');
  if (child.url || override) {
    return `<li><a href="${href}"${isActive ? ' class="active"' : ''}>${escapeHtml(child.label)}</a></li>`;
  }
  return `<li><span class="nav-label${isActive ? ' active' : ''}" title="Not linked to a page yet">${escapeHtml(child.label)}</span></li>`;
}

function buildNavItem(item, currentPath) {
  const isActive = currentPath === item.localPath ||
    currentPath.startsWith(item.localPath + '/');

  if (item.children.length > 0) {
    const childrenHtml = item.children.map((c) => buildDropdownItem(c, currentPath)).join('');
    const activeClass = isActive ? ' active' : '';
    return `
        <li class="nav-dropdown${activeClass}">
          <button class="nav-dropdown-btn${activeClass}" aria-expanded="false">
            ${escapeHtml(item.label)}
            <svg class="dropdown-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>
          </button>
          <ul class="dropdown-menu">${childrenHtml}</ul>
        </li>`;
  }

  if (item.url) {
    return `<li><a href="${item.localPath}"${isActive ? ' class="active"' : ''}>${escapeHtml(item.label)}</a></li>`;
  }
  return `<li><span class="nav-label${isActive ? ' active' : ''}" title="Not linked to a page yet">${escapeHtml(item.label)}</span></li>`;
}

function buildNavHtml(navItems, currentPath) {
  return navItems.map((item) => buildNavItem(item, currentPath)).join('\n');
}

// --- Content area builders ---

/**
 * HubSpot content: fetched server-side by proxy.php and injected directly.
 * The URL is hardcoded into the generated .php file at build time.
 */
function renderProxyContent(url) {
  const safeUrl = url.replace(/'/g, "\\'");
  return `<div class="content-proxy" data-source="${escapeHtml(url)}"><?php require_once $_SERVER['DOCUMENT_ROOT'] . '/proxy.php'; echo hs_fetch('${safeUrl}'); ?></div>`;
}

function renderNotFound() {
  return `
    <div class="content-not-found">
      <h1>Page Not Found</h1>
      <p>The page you&rsquo;re looking for doesn&rsquo;t exist or hasn&rsquo;t been linked yet.</p>
      <a href="/" class="btn-primary">Return Home</a>
    </div>`;
}

function renderPlaceholder(label) {
  return `
    <div class="content-placeholder">
      <p>Content for <strong>${escapeHtml(label)}</strong> is coming soon.</p>
    </div>`;
}

// --- Social SVG icons (inlined to avoid extra requests) ---

const ICON_LINKEDIN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;
const ICON_YOUTUBE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
const ICON_GITHUB = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;
const ICON_SPOTIFY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;
const ICON_APPLE_PODCASTS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.34 0A5.328 5.328 0 000 5.34v13.32A5.328 5.328 0 005.34 24h13.32A5.328 5.328 0 0024 18.66V5.34A5.328 5.328 0 0018.66 0zm6.525 2.568c4.988 0 7.399 3.376 7.399 6.852 0 2.327-.901 4.26-2.34 5.47-.139.118-.347.022-.347-.16v-.044c0-.15.05-.31.14-.45.89-1.38 1.32-2.88 1.32-4.82 0-3.07-2.16-5.67-6.17-5.67-4.02 0-6.18 2.6-6.18 5.67 0 1.94.43 3.44 1.32 4.82.09.14.14.3.14.45v.044c0 .182-.208.278-.347.16-1.44-1.21-2.34-3.143-2.34-5.47 0-3.476 2.411-6.852 7.405-6.852zM12 6.976c2.585 0 4.312 1.86 4.312 4.212 0 1.14-.36 2.22-.96 3.06-.06.09-.17.13-.27.1a.267.267 0 01-.19-.23c-.05-.37-.18-.62-.36-.87-.02-.03-.02-.07-.01-.1.6-.87.87-1.78.87-2.82 0-1.94-1.41-3.39-3.39-3.39s-3.39 1.45-3.39 3.39c0 1.04.27 1.95.87 2.82.01.03.01.07-.01.1-.18.25-.31.5-.36.87a.267.267 0 01-.19.23c-.1.03-.21-.01-.27-.1-.6-.84-.96-1.92-.96-3.06 0-2.352 1.727-4.212 4.312-4.212zm-.04 4.258c.79 0 1.39.7 1.39 1.49a1.5 1.5 0 01-.93 1.39c-.1.04-.17.14-.17.25l.005.06.28 2.04c.04.3-.18.57-.49.57h-.18c-.31 0-.53-.27-.49-.57l.28-2.04.005-.06c0-.11-.07-.21-.17-.25a1.5 1.5 0 01-.93-1.39c0-.79.6-1.49 1.39-1.49z"/></svg>`;

// Cache-busting version stamped at build time so browsers fetch updated assets.
const ASSET_VERSION = Date.now();

// --- Page template ---

/**
 * The one page template. title, year, and contentHtml are inserted verbatim,
 * so callers must escape them (or pass PHP echo snippets).
 */
function renderPage({ title, navHtml, contentHtml, year }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="/css/theme-bridge.css?v=${ASSET_VERSION}">
</head>
<body class="site-body">

  <header class="site-header" id="site-header">
    <div class="header-inner">
      <a href="/" class="site-logo" aria-label="CESMII home">
        <img src="/images/cesmii-logo.png" alt="CESMII" class="logo-img">
      </a>
      <div class="header-right">
        <div class="top-bar-row">
          <a href="/membership/membership-hub" class="top-bar-btn">Become a Member</a>
          <a href="/our-focus/sm-roadmapping" class="top-bar-btn top-bar-btn-secondary">Start Your Roadmap</a>
          <div class="top-bar-social">
            <a href="https://www.linkedin.com/company/the-smart-manufacturing-institute/" target="_blank" rel="noopener" aria-label="LinkedIn">${ICON_LINKEDIN}</a>
            <a href="https://www.youtube.com/channel/UCzfo1qx-6ExYGdW-S8A3HAA" target="_blank" rel="noopener" aria-label="YouTube">${ICON_YOUTUBE}</a>
            <a href="https://github.com/cesmii" target="_blank" rel="noopener" aria-label="GitHub">${ICON_GITHUB}</a>
          </div>
        </div>
        <nav aria-label="Main">
          <ul class="nav-links" id="nav-links">
            ${navHtml}
          </ul>
        </nav>
      </div>
      <button class="nav-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="nav-links">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>

  <main class="site-content" id="site-content">
    ${contentHtml}
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-col footer-brand">
        <img src="/images/cesmii-logo.png" alt="CESMII" class="footer-logo-img">
        <p class="footer-tagline">The Smart Manufacturing Institute</p>
      </div>
      <div class="footer-col">
        <h4>Contact</h4>
        <p>Los Angeles, California</p>
        <p><a href="tel:8887208096">(888) 720-8096</a></p>
        <p><a href="mailto:info@cesmii.org">info@cesmii.org</a></p>
      </div>
      <div class="footer-col">
        <h4>Follow Us</h4>
        <div class="footer-social">
          <a href="https://www.linkedin.com/company/the-smart-manufacturing-institute/" target="_blank" rel="noopener" aria-label="LinkedIn">${ICON_LINKEDIN}</a>
          <a href="https://www.youtube.com/channel/UCzfo1qx-6ExYGdW-S8A3HAA" target="_blank" rel="noopener" aria-label="YouTube">${ICON_YOUTUBE}</a>
          <a href="https://github.com/cesmii" target="_blank" rel="noopener" aria-label="GitHub">${ICON_GITHUB}</a>
          <a href="https://open.spotify.com/show/2EYduePF6JsI37pRDtDaGz" target="_blank" rel="noopener" aria-label="Spotify">${ICON_SPOTIFY}</a>
          <a href="https://podcasts.apple.com/us/podcast/smart-manufacturing-mindset/id1694727743" target="_blank" rel="noopener" aria-label="Apple Podcasts">${ICON_APPLE_PODCASTS}</a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; ${year} CESMII &ndash; The Smart Manufacturing Institute</p>
    </div>
  </footer>

  <script src="/js/app.js?v=${ASSET_VERSION}"></script>
</body>
</html>`;
}

/**
 * Build-time shell for a gloomap page (or the 404 page).
 */
function renderShell({ navItems, title, currentPath, contentHtml }) {
  return renderPage({
    title: title ? `${escapeHtml(title)} – CESMII` : 'CESMII – The Smart Manufacturing Institute',
    navHtml: buildNavHtml(navItems, currentPath),
    contentHtml,
    year: String(new Date().getFullYear()),
  });
}

/**
 * Generate dynamic.php: a catch-all PHP handler for database-driven sections
 * (e.g. /bio/*, /news/*) that have no individual gloomap entries.
 *
 * dynamicSections: array of { prefix: '/bio', hsBase: 'https://…/bio' }
 *
 * The handler:
 *   1. Matches REQUEST_URI against known prefixes.
 *   2. Proxies the corresponding HubSpot URL via hs_fetch().
 *   3. Extracts the page title via hs_fetch_title() (no extra HTTP fetch).
 *   4. Renders the full shell with nav baked in at build time.
 *   5. Returns 404 (serving out/404.html) for unrecognised paths.
 */
function renderDynamicHandler(navItems, dynamicSections) {
  const sectionsPhp = dynamicSections
    .map(({ prefix, hsBase }) => `    '${prefix}' => '${hsBase}',`)
    .join('\n');

  const prelude = `<?php
// Generated by build.js — do not edit directly.
require_once $_SERVER['DOCUMENT_ROOT'] . '/proxy.php';

$sections = [
${sectionsPhp}
];

$raw_uri = $_SERVER['REQUEST_URI'] ?? '/';
$uri     = strtok($raw_uri, '?');
$qs      = (strpos($raw_uri, '?') !== false) ? '?' . substr($raw_uri, strpos($raw_uri, '?') + 1) : '';

// ?debug is a site-framework flag (see app.js); never pass it upstream to HubSpot.
if ($qs !== '') {
    parse_str(substr($qs, 1), $params);
    unset($params['debug']);
    $qs = $params ? '?' . http_build_query($params) : '';
}

// Cross-blog aliases. The filter bar on the /news blog is shared template markup
// and links "Newsletter" at /news/topic/newsletter, but no /news post carries that
// tag — newsletters are published to a separate HubSpot blog at /newsletter.
// Redirect rather than proxy in place so the URL matches the content being shown.
$aliases = [
    '/news/topic/newsletter' => '/newsletter',
    '/news/tag/newsletter'   => '/newsletter',
];
if (isset($aliases[rtrim($uri, '/')])) {
    header('Location: ' . $aliases[rtrim($uri, '/')], true, 301);
    exit;
}

$hs_url  = null;
foreach ($sections as $prefix => $hs_base) {
    if (str_starts_with($uri, $prefix . '/') || $uri === $prefix) {
        $hs_url = rtrim($hs_base, '/') . substr($uri, strlen($prefix)) . $qs;
        break;
    }
}

// Rewrite /topic/slug_name to /tag/slug-name (HubSpot serves tag/ server-side).
// Some topic slugs don't map 1:1 via underscore→hyphen; look them up first.
$topic_to_tag = [
    'sm_mindset'            => 'smart-manufacturing-mindset',
    'sm_executive_council'  => 'smart-manufacturing-executive-council',
];
if ($hs_url !== null) {
    $hs_url = preg_replace_callback(
        '#/topic/([^/?]+)#',
        fn($m) => '/tag/' . ($topic_to_tag[$m[1]] ?? str_replace('_', '-', $m[1])),
        $hs_url
    );
}

if ($hs_url === null) {
    http_response_code(404);
    echo @file_get_contents($_SERVER['DOCUMENT_ROOT'] . '/404.html')
        ?: '<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>';
    exit;
}

$content = hs_fetch($hs_url);

// A path under a known prefix can still not exist upstream (a bad slug, or a broken
// link in HubSpot content pointing at one). Serve a real 404 rather than 200 with an
// error notice, so visitors and crawlers both get the truth. Transient upstream
// failures (timeout, 5xx) deliberately fall through to the notice instead.
if (hs_last_status() === 404) {
    http_response_code(404);
    echo @file_get_contents($_SERVER['DOCUMENT_ROOT'] . '/404.html')
        ?: '<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>';
    exit;
}

$hs_title = hs_fetch_title($hs_url);
$clean    = preg_replace('/\\s*[|-]\\s*CESMII.*$/iu', '', $hs_title);
$title    = $clean
    ? htmlspecialchars($clean, ENT_QUOTES, 'UTF-8') . ' – CESMII'
    : 'CESMII – The Smart Manufacturing Institute';
?>`;

  return prelude + renderPage({
    title: '<?php echo $title; ?>',
    navHtml: buildNavHtml(navItems, ''),
    contentHtml: `
    <?php
      $is_blog_post = str_starts_with($uri, '/news/') && !preg_match('#^/news/(tag|topic)/#', $uri);
      $proxy_class = 'content-proxy' . ($is_blog_post ? ' content-proxy--blog-post' : '');
    ?>
    <div class="<?php echo $proxy_class; ?>" data-source="<?php echo htmlspecialchars($hs_url, ENT_QUOTES, 'UTF-8'); ?>"><?php echo $content; ?></div>`,
    year: "<?php echo date('Y'); ?>",
  });
}

module.exports = { renderShell, renderProxyContent, renderNotFound, renderPlaceholder, renderDynamicHandler };

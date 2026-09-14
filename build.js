#!/usr/bin/env node
/**
 * build.js — Static site generator
 *
 * Reads gloomap.xml, generates a complete site in out/.
 * Each linked nav item gets out/{path}/index.php with the full shell; the page
 * body is fetched from HubSpot at request time by proxy.php.
 *
 * Usage:
 *   node build.js          # build once
 *   npm run build          # same
 *   npm run dev            # build + serve locally
 */

const fs = require('fs');
const path = require('path');
const { loadNavFromGloomap } = require('./lib/gloomap-parser');
const {
  renderShell,
  renderProxyContent,
  renderNotFound,
  renderPlaceholder,
  renderDynamicHandler,
} = require('./lib/shell-renderer');

// Database-driven sections with no individual gloomap entries.
// Each entry maps a local path prefix to its HubSpot base URL.
// nginx routes unmatched paths to out/dynamic.php, which handles these.
const DYNAMIC_SECTIONS = [
  { prefix: '/bio', hsBase: 'https://43818189.hs-sites.com/bio' },
  { prefix: '/news', hsBase: 'https://43818189.hs-sites.com/news' },
  // Newsletters live in a separate HubSpot blog (id 214229568301), not in /news.
  { prefix: '/newsletter', hsBase: 'https://43818189.hs-sites.com/newsletter' },
  { prefix: '/projects', hsBase: 'https://43818189.hs-sites.com/projects' },
  { prefix: '/project', hsBase: 'https://43818189.hs-sites.com/project' },
  { prefix: '/events', hsBase: 'https://43818189.hs-sites.com/events' },
  { prefix: '/hs-search-results', hsBase: 'https://43818189.hs-sites.com/hs-search-results' },
  { prefix: '/sm-profiles', hsBase: 'https://43818189.hs-sites.com/sm-profiles' },
  { prefix: '/sm-interoperability-platform', hsBase: 'https://43818189.hs-sites.com/sm-interoperability-platform' },
];

const OUT_DIR = path.join(__dirname, 'out');
const PUBLIC_DIR = path.join(__dirname, 'public');
const GLOOMAP_PATH = path.join(__dirname, 'gloomap.xml');

// --- Helpers ---

function write(relPath, html) {
  const abs = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html, 'utf8');
  console.log(`  ${relPath}`);
}

// Walk the nav tree and generate a page only for items that have a URL.
// Items without a URL are nav structure only and produce no output file.
function generatePages(items, allNavItems) {
  for (const item of items) {
    if (item.url) {
      write(
        path.join(item.localPath, 'index.php'),
        renderShell({
          navItems: allNavItems,
          title: item.label,
          currentPath: item.localPath,
          contentHtml: renderProxyContent(item.url),
        })
      );
    }
    if (item.children.length > 0) {
      generatePages(item.children, allNavItems);
    }
  }
}

// --- Build ---

async function build() {
  const start = Date.now();
  console.log('Building...');

  // Fresh output directory
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Copy static assets (CSS, JS, images, etc.)
  fs.cpSync(PUBLIC_DIR, OUT_DIR, { recursive: true });
  console.log('  public/ → out/');

  // Parse gloomap
  const { homepageUrl, navItems } = await loadNavFromGloomap(GLOOMAP_PATH);
  console.log(`  gloomap: ${navItems.length} top-level nav items`);

  // Homepage: out/index.php if the root gloomap box has a URL, else a placeholder.
  write(homepageUrl ? 'index.php' : 'index.html', renderShell({
    navItems,
    title: '',
    currentPath: '/',
    contentHtml: homepageUrl ? renderProxyContent(homepageUrl) : renderPlaceholder('Homepage'),
  }));

  // Site map viewer (out/sitemap/) and the gloomap it reads (out/gloomap.xml)
  fs.mkdirSync(path.join(OUT_DIR, 'sitemap'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'tools', 'gloomap-viewer.html'), path.join(OUT_DIR, 'sitemap', 'index.html'));
  fs.copyFileSync(GLOOMAP_PATH, path.join(OUT_DIR, 'gloomap.xml'));
  console.log('  sitemap/index.html, gloomap.xml');

  // Dynamic section handler (out/dynamic.php — nginx @dynamic fallback)
  write('dynamic.php', renderDynamicHandler(navItems, DYNAMIC_SECTIONS));

  // 404 page (out/404.html — nginx error_page directive and dynamic.php fallback)
  write('404.html', renderShell({
    navItems,
    title: 'Page Not Found',
    currentPath: '',
    contentHtml: renderNotFound(),
  }));

  // One page per nav item
  generatePages(navItems, navItems);

  console.log(`\nDone in ${Date.now() - start}ms → out/`);
}

build().catch((err) => {
  console.error('\nBuild failed:', err.message);
  process.exit(1);
});

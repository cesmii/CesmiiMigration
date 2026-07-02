#!/usr/bin/env node
/**
 * build.js — Static site generator
 *
 * Reads gloomap.xml, generates a complete static site in out/.
 * Each nav item gets out/{path}/index.html with the full shell.
 * HubSpot content is loaded via iframe at visit time — no server needed at runtime.
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
  renderStaticContent,
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
  { prefix: '/projects', hsBase: 'https://43818189.hs-sites.com/projects' },
  { prefix: '/project', hsBase: 'https://43818189.hs-sites.com/project' },
  { prefix: '/events', hsBase: 'https://43818189.hs-sites.com/events' },
  { prefix: '/hs-search-results', hsBase: 'https://43818189.hs-sites.com/hs-search-results' },
  { prefix: '/sm-profiles', hsBase: 'https://43818189.hs-sites.com/sm-profiles' },
  { prefix: '/sm-interoperability-platform', hsBase: 'https://43818189.hs-sites.com/sm-interoperability-platform' },
];

const PROJECT_ROOT = __dirname;
const OUT_DIR = path.join(PROJECT_ROOT, 'out');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const GLOOMAP_PATH = path.join(PROJECT_ROOT, 'gloomap.xml');

// --- Helpers ---

function write(relPath, html) {
  const abs = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html, 'utf8');
  console.log(`  ${relPath}`);
}

function contentFor(item) {
  if (item.type === 'hubspot') return { html: renderProxyContent(item.url), type: 'hubspot' };
  if (item.type === 'static')  return { html: renderStaticContent(item.url, PROJECT_ROOT), type: 'static' };
  return { html: renderPlaceholder(item.label), type: 'placeholder' };
}

// Walk the nav tree and generate a page only for items that have a URL.
// Items without a URL are nav structure only and produce no output file.
function generatePages(items, allNavItems) {
  for (const item of items) {
    if (item.url) {
      const { html, type } = contentFor(item);
      const filename = type === 'hubspot' ? 'index.php' : 'index.html';
      write(
        path.join(item.localPath, filename),
        renderShell({
          navItems: allNavItems,
          title: item.label,
          currentPath: item.localPath,
          contentHtml: html,
          contentType: type,
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

  // Homepage (out/index.html)
  const homepageContent = homepageUrl
    ? homepageUrl.startsWith('/')
      ? { html: renderStaticContent(homepageUrl, PROJECT_ROOT), type: 'static' }
      : { html: renderProxyContent(homepageUrl), type: 'hubspot' }
    : { html: renderPlaceholder('Homepage'), type: 'placeholder' };

  const homeFile = homepageContent.type === 'hubspot' ? 'index.php' : 'index.html';
  write(homeFile, renderShell({
    navItems,
    title: '',
    currentPath: '/',
    contentHtml: homepageContent.html,
    contentType: homepageContent.type,
  }));

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

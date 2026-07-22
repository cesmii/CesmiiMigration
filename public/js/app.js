/**
 * app.js — Client-side interactivity for the site chrome.
 *
 * Handles: mobile nav toggle, dropdown open/close, scroll effect on header.
 * The nav and footer HTML are server-rendered — nothing is injected here.
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  initDropdowns();
  initScrollEffect();
  initFilterHighlight();
  initHubSpotLinkRewrite();
});

function initNavToggle() {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (!toggle || !navLinks) return;

  toggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  });

  // Close nav when clicking outside
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !navLinks.contains(e.target)) {
      navLinks.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
    }
  });
}

function initDropdowns() {
  document.querySelectorAll('.nav-dropdown > .nav-dropdown-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      // On mobile (nav-links is flex column), toggle open state
      if (window.getComputedStyle(document.getElementById('nav-links')).flexDirection === 'column') {
        e.preventDefault();
        const li = btn.parentElement;
        const isOpen = li.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(isOpen));

        // Close other open dropdowns
        document.querySelectorAll('.nav-dropdown.open').forEach((other) => {
          if (other !== li) {
            other.classList.remove('open');
            const otherBtn = other.querySelector('.nav-dropdown-btn');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }
    });
  });
}

function initFilterHighlight() {
  var btns = document.querySelectorAll('.news-filters__btn');
  if (!btns.length) return;
  var path = location.pathname.replace(/\/+$/, '') || '/news';
  btns.forEach(function (btn) {
    var href = (btn.getAttribute('href') || '').replace(/\/+$/, '');
    // Strip protocol-relative or absolute HubSpot origin to get local path
    href = href.replace(/^(?:https?:)?\/\/[^/]+/, '');
    btn.classList.toggle('is-active', href === path);
  });
}

/**
 * Rewrite links pointing to the HubSpot CMS domain so users stay on-site.
 *
 * Two mechanisms:
 * 1. MutationObserver rewrites href attributes as HubSpot's JS inserts
 *    search results into the DOM — links are fixed before the user clicks.
 * 2. Capturing-phase click handler as a fallback for anything the observer
 *    misses (e.g. links built from concatenated strings in JS).
 */
function initHubSpotLinkRewrite() {
  var HS_HOST = '43818189.hs-sites.com';

  function rewriteLinks(root) {
    var anchors = root.querySelectorAll
      ? root.querySelectorAll('a[href*="' + HS_HOST + '"]')
      : [];
    for (var i = 0; i < anchors.length; i++) {
      rewriteOne(anchors[i]);
    }
    if (root.matches && root.matches('a[href]')) rewriteOne(root);
  }

  function rewriteOne(a) {
    var href = a.getAttribute('href');
    if (!href) return;
    try {
      var url = new URL(href, location.origin);
      if (url.hostname === HS_HOST) {
        a.setAttribute('href', url.pathname + url.search + url.hash);
      }
    } catch (_) {}
  }

  // Rewrite any HubSpot links already in the page
  rewriteLinks(document.body);

  // Watch for dynamically-added links (search results, etc.)
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        if (added[j].nodeType === 1) rewriteLinks(added[j]);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Capturing-phase click handler — fires before HubSpot's own handlers.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;

    // Search result links: HubSpot's analytics script rewrites the href
    // to a tracking URL (/_hcms/analytics/search/conversion?redirect=<base64>)
    // before the click. That endpoint fails with INVALID_SIGNATURE through
    // the proxy. Detect the tracking URL, decode the redirect, and navigate
    // to the local path instead.
    if (a.closest('.hs-search-results')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var target = href;
      if (href.indexOf('/_hcms/analytics/') !== -1) {
        try {
          var params = new URLSearchParams(href.split('?')[1]);
          var redirect = params.get('redirect');
          if (redirect) {
            var decoded = atob(redirect);
            var rurl = new URL(decoded);
            target = rurl.pathname + rurl.search + rurl.hash;
          }
        } catch (_) {}
      }
      location.href = target;
      return;
    }

    // Any other link still pointing to the HubSpot domain
    try {
      var url = new URL(href, location.origin);
      if (url.hostname === HS_HOST) {
        e.preventDefault();
        e.stopImmediatePropagation();
        location.href = url.pathname + url.search + url.hash;
      }
    } catch (_) {}
  }, true);
}

function initScrollEffect() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const update = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

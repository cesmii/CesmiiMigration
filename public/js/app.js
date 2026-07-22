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
 * Intercept clicks on links pointing to the HubSpot CMS domain and
 * navigate to the equivalent local path instead. HubSpot's search module
 * renders result links client-side with absolute HubSpot URLs; this keeps
 * the user on the CESMII site shell.
 */
function initHubSpotLinkRewrite() {
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    try {
      var url = new URL(href, location.origin);
      if (url.hostname === '43818189.hs-sites.com') {
        e.preventDefault();
        location.href = url.pathname + url.search + url.hash;
      }
    } catch (_) { /* invalid URL, ignore */ }
  });
}

function initScrollEffect() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const update = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

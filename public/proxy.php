<?php
/**
 * proxy.php — HubSpot content proxy (function library; not a web endpoint).
 *
 * Included by generated .php pages. Direct web access is blocked by nginx.
 * Usage in a generated page:
 *   require_once $_SERVER['DOCUMENT_ROOT'] . '/proxy.php';
 *   echo hs_fetch('https://43818189.hs-sites.com/page-slug');
 *   echo hs_fetch('https://membershiphub.cesmii.org/membership-sign-in');
 */

// Belt-and-suspenders guard — nginx blocks direct requests, but just in case.
if (__FILE__ === realpath($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    http_response_code(404);
    exit;
}

const HS_ALLOWED_HOSTS        = ['43818189.hs-sites.com', 'membershiphub.cesmii.org', 'connect.cesmii.org'];
const HS_ALLOWED_SCRIPT_HOSTS = ['unpkg.com'];  // non-HubSpot script hosts to allow through
const HS_NO_REWRITE           = [
    'https://membershiphub.cesmii.org/welcome',
    'https://43818189.hs-sites.com/members',
];
// HubSpot paths that don't match the local nav hierarchy.
// After absolute→relative rewriting, these flat paths are remapped to their local equivalents.
const HS_PATH_MAP = [
    '/board-of-directors' => '/about/board-of-directors',
    '/smec'               => '/about/sm-executive-council',
];
const HS_CACHE_TTL     = 3600;  // seconds; cached in system temp dir
const HS_FETCH_TIMEOUT = 10;    // curl timeout in seconds

/**
 * Fetch a HubSpot page and return a clean HTML fragment.
 * Caches results on disk; serves stale cache if upstream is unreachable.
 */
function hs_fetch(string $url): string {
    $allowed = false;
    foreach (HS_ALLOWED_HOSTS as $host) {
        if (str_starts_with($url, 'https://' . $host . '/')) { $allowed = true; break; }
    }
    if (!$allowed) {
        return _hs_error('Disallowed URL.');
    }

    $cache_file = sys_get_temp_dir() . '/cesmii_' . md5($url) . '.html';

    if (is_file($cache_file) && (time() - filemtime($cache_file)) < HS_CACHE_TTL) {
        $cached = file_get_contents($cache_file);
        if ($cached !== false && $cached !== '') return $cached;
    }

    $html = _hs_curl($url);

    if ($html === null) {
        // Prefer stale cache over an error page when upstream is down.
        if (is_file($cache_file)) {
            $stale = file_get_contents($cache_file);
            if ($stale !== false && $stale !== '') return $stale;
        }
        return _hs_error('Content temporarily unavailable.');
    }

    $fragment = _hs_extract($html, $url);
    @file_put_contents($cache_file, $fragment);
    return $fragment;
}

function _hs_curl(string $url): ?string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => HS_FETCH_TIMEOUT,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; CESMII-Proxy/1.0)',
        CURLOPT_ENCODING       => '',       // accept gzip/deflate
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body   = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($body !== false && $status >= 200 && $status < 300) ? $body : null;
}

/**
 * Strip HubSpot chrome and return the page content as an HTML fragment.
 * Keeps styles scoped to .content-proxy so they don't bleed into the shell.
 * Strips scripts, HubSpot header/footer/nav, iframes, and non-stylesheet links.
 * Prefers <main>; falls back to <body>.
 */
function _hs_extract(string $html, string $source_url): string {
    // Cache page title as a side-effect (read back by hs_fetch_title).
    @file_put_contents(
        sys_get_temp_dir() . '/cesmii_' . md5($source_url) . '_title.txt',
        _hs_extract_title($html)
    );

    $dom = new DOMDocument();
    @$dom->loadHTML($html, LIBXML_NOERROR | LIBXML_NOWARNING);
    $xpath = new DOMXPath($dom);
    $parts  = parse_url($source_url);
    $origin = $parts['scheme'] . '://' . $parts['host'];

    // Collect CSS: fetch external stylesheets inline, collect <style> contents.
    $css_parts = [];
    foreach (iterator_to_array($xpath->query('//link[@rel="stylesheet"]')) as $node) {
        $href = $node->getAttribute('href');
        if (!$href) continue;
        if (str_starts_with($href, '/')) $href = $origin . $href;
        $css = _hs_curl($href);
        if ($css !== null) $css_parts[] = $css;
    }
    foreach (iterator_to_array($xpath->query('//style')) as $node) {
        // Skip <style> inside <noscript> — those rules only apply when JS is off.
        if ($node->parentNode && $node->parentNode->nodeName === 'noscript') continue;
        $css_parts[] = $node->textContent;
    }

    // Strip chrome and non-content elements (scripts handled separately below).
    foreach (['style', 'link', 'noscript', 'header', 'footer', 'nav', 'iframe'] as $tag) {
        foreach (iterator_to_array($xpath->query("//{$tag}")) as $node) {
            $node->parentNode?->removeChild($node);
        }
    }

    // Strip HubSpot's built-in blog tag filter widget (replaced by custom filters).
    foreach (iterator_to_array($xpath->query(
        '//*[contains(@class,"blog-index__filter-tags-container")]'
    )) as $node) {
        $node->parentNode?->removeChild($node);
    }

    // Scripts: keep inline scripts and HubSpot-hosted external scripts.
    // Strip third-party scripts unless their host is in HS_ALLOWED_SCRIPT_HOSTS.
    foreach (iterator_to_array($xpath->query('//script')) as $node) {
        $src = $node->getAttribute('src');
        if ($src === '') continue;                              // inline — keep
        if (_hs_is_hubspot_script($src)) continue;             // HubSpot CDN — keep
        $host = parse_url($src, PHP_URL_HOST) ?: '';
        if (in_array($host, HS_ALLOWED_SCRIPT_HOSTS, true)) continue;  // whitelisted — keep
        $node->parentNode?->removeChild($node);
    }

    // Collect kept scripts from the full body before narrowing to <main>.
    $body_scripts = '';
    $body = $xpath->query('//body')->item(0);
    if ($body) {
        foreach (iterator_to_array($xpath->query('//body//script')) as $node) {
            $body_scripts .= $dom->saveHTML($node);
        }
    }

    $container = $xpath->query('//main')->item(0) ?? $body;

    if ($container === null) {
        return _hs_error('Could not extract page content.');
    }

    $fragment = '';
    foreach ($container->childNodes as $child) {
        $fragment .= $dom->saveHTML($child);
    }

    // Append any kept scripts that lived outside <main>.
    if ($container->nodeName === 'main' && $body_scripts) {
        $fragment .= $body_scripts;
    }

    // Scope all HubSpot CSS inside .content-proxy so it can't affect the shell.
    $scoped_css = '';
    if ($css_parts) {
        $all_css = implode("\n", $css_parts);
        // Rewrite root-relative URLs in CSS (url(/...) references)
        $all_css = preg_replace_callback(
            '/url\(\s*["\']?(\/[^)"\']+)["\']?\s*\)/i',
            fn($m) => 'url(' . $origin . $m[1] . ')',
            $all_css
        );
        $scoped_css = '<style>' . _hs_scope_css($all_css) . '</style>';
    }

    $content = $scoped_css . _hs_rewrite_urls(trim($fragment), $source_url);
    return $content;
}

/**
 * Scope CSS rules by prepending .content-proxy to each selector.
 * Handles @media blocks, @font-face, @keyframes, and regular rules.
 */
function _hs_scope_css(string $css): string {
    // Remove comments, @charset, and @import
    $css = preg_replace('/\/\*.*?\*\//s', '', $css);
    $css = preg_replace('/@charset\s+[^;]+;/i', '', $css);
    $css = preg_replace('/@import\s+[^;]+;/i', '', $css);

    // Process the CSS: scope selectors inside .content-proxy
    return preg_replace_callback(
        '/@?[^{}]+\{/',
        function ($m) {
            $selectors = $m[0];
            $selectors = substr($selectors, 0, -1); // remove trailing {
            // Don't scope @-rules (media, keyframes, font-face, supports, layer)
            if (preg_match('/^\s*@/', $selectors)) return $m[0];
            // Don't scope selectors inside @keyframes (from, to, percentages)
            if (preg_match('/^\s*(\d+%|from|to)\s*$/i', trim($selectors))) return $m[0];

            // Split comma-separated selectors and prefix each
            $parts = explode(',', $selectors);
            $scoped = array_map(function ($sel) {
                $sel = trim($sel);
                if ($sel === '') return $sel;
                // body/html selectors → .content-proxy
                if (preg_match('/^(body|html)(\s|$|\.|\[|:)/i', $sel)) {
                    $sel = preg_replace('/^(body|html)/i', '.content-proxy', $sel);
                } elseif (preg_match('/^(body|html)$/i', $sel)) {
                    $sel = '.content-proxy';
                } else {
                    $sel = '.content-proxy ' . $sel;
                }
                return $sel;
            }, $parts);
            return implode(', ', $scoped) . '{';
        },
        $css
    );
}

/**
 * Rewrite URLs in the HTML fragment:
 * - href pointing to HubSpot origin → local relative paths (keeps navigation on-site)
 * - src pointing to root-relative paths → absolute HubSpot URLs (so images load)
 * - href pointing to root-relative paths that look like assets → absolute HubSpot URLs
 */
function _hs_rewrite_urls(string $html, string $source_url): string {
    $parts  = parse_url($source_url);
    $origin = $parts['scheme'] . '://' . $parts['host'];
    $origin_http = 'http://' . $parts['host'];
    $origin_https = 'https://' . $parts['host'];

    // First: rewrite absolute and protocol-relative HubSpot links to local relative paths
    // (skip URLs in HS_NO_REWRITE)
    $html = preg_replace_callback(
        '/href="((?:https?:)?\/\/' . preg_quote($parts['host'], '/') . ')(\/[^"]*)"/i',
        function ($m) {
            $full = preg_replace('/^\/\//', 'https://', $m[1]) . $m[2];
            $fullNoQs = strtok($full, '?');
            $pathNoQs = strtok($m[2], '?');
            foreach (HS_NO_REWRITE as $skip) {
                if ($fullNoQs === $skip || str_starts_with($fullNoQs, $skip . '/')) return $m[0];
                if ($pathNoQs === $skip || str_starts_with($pathNoQs, $skip . '/')) return $m[0];
            }
            return 'href="' . $m[2] . '"';
        },
        $html
    );

    // Rewrite onclick location.href URLs (e.g. blog filter buttons)
    $html = preg_replace_callback(
        '/location\.href=\'((?:https?:)?\/\/' . preg_quote($parts['host'], '/') . ')(\/[^\']*)\'/i',
        function ($m) {
            $full = preg_replace('/^\/\//', 'https://', $m[1]) . $m[2];
            $fullNoQs = strtok($full, '?');
            $pathNoQs = strtok($m[2], '?');
            foreach (HS_NO_REWRITE as $skip) {
                if ($fullNoQs === $skip || str_starts_with($fullNoQs, $skip . '/')) return $m[0];
                if ($pathNoQs === $skip || str_starts_with($pathNoQs, $skip . '/')) return $m[0];
            }
            return "location.href='" . $m[2] . "'";
        },
        $html
    );

    // Remap HubSpot paths to their local nav-hierarchy equivalents (e.g. /smec → /about/sm-executive-council)
    $html = preg_replace_callback(
        '/href="(\/[^"]*)"/i',
        function ($m) {
            $path = strtok($m[1], '?');
            $qs   = (strpos($m[1], '?') !== false) ? substr($m[1], strpos($m[1], '?')) : '';
            foreach (HS_PATH_MAP as $from => $to) {
                if ($path === $from || str_starts_with($path, $from . '/')) {
                    return 'href="' . $to . substr($path, strlen($from)) . $qs . '"';
                }
            }
            return $m[0];
        },
        $html
    );

    // Second: rewrite root-relative src to absolute HubSpot URLs (images, scripts, etc.)
    $html = preg_replace_callback(
        '/src="(\/[^"]*)"/i',
        fn($m) => 'src="' . $origin . $m[1] . '"',
        $html
    );

    // Third: rewrite root-relative href for assets (files with extensions) to absolute HubSpot URLs
    // but leave page links (no extension or trailing slash) as local relative paths.
    // (?!\/) excludes protocol-relative URLs (//example.com) from being treated as assets.
    // (?:\?[^"]*)? allows an optional query string after the file extension.
    $html = preg_replace_callback(
        '/href="(\/(?!\/)[^"?]*\.[a-z0-9]{2,5}(?:\?[^"]*)?)"/i',
        fn($m) => 'href="' . $origin . $m[1] . '"',
        $html
    );

    // Fix bare-domain hrefs missing a protocol (e.g. href="example.com")
    $html = preg_replace(
        '/href="(?!https?:\/\/|\/\/|\/|#|mailto:|tel:|javascript:)([^"\/]+\.[a-z]{2,}(?:\/[^"]*)?)"/i',
        'href="https://$1"',
        $html
    );

    return $html;
}

/**
 * Returns true if a script src is HubSpot-hosted and safe to pass through.
 * Root-relative paths (/hs/...) are HubSpot's own static assets.
 */
function _hs_is_hubspot_script(string $src): bool {
    if (str_starts_with($src, '/')) return true;
    $host = parse_url($src, PHP_URL_HOST) ?: '';
    return str_ends_with($host, '.hubspot.com')
        || str_ends_with($host, '.hs-sites.com')
        || str_ends_with($host, 'hubspotusercontent-na1.net')
        || str_ends_with($host, 'hubspotusercontent-eu1.net');
}

function _hs_error(string $msg): string {
    return '<div class="content-error">' . htmlspecialchars($msg, ENT_QUOTES) . '</div>';
}

function _hs_extract_title(string $html): string {
    if (preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m)) {
        return html_entity_decode(trim(strip_tags($m[1])), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
    return '';
}

/**
 * Return the page title for a HubSpot URL.
 * Reads from a sidecar cache written by hs_fetch(). Triggers a fresh fetch
 * (and sidecar write) if the cache is absent or stale.
 */
function hs_fetch_title(string $url): string {
    $allowed = false;
    foreach (HS_ALLOWED_HOSTS as $host) {
        if (str_starts_with($url, 'https://' . $host . '/')) { $allowed = true; break; }
    }
    if (!$allowed) return '';
    $title_file = sys_get_temp_dir() . '/cesmii_' . md5($url) . '_title.txt';
    if (is_file($title_file) && (time() - filemtime($title_file)) < HS_CACHE_TTL) {
        $t = file_get_contents($title_file);
        if ($t !== false) return $t;
    }
    hs_fetch($url);
    $t = is_file($title_file) ? file_get_contents($title_file) : '';
    return ($t !== false) ? $t : '';
}

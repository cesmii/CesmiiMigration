<?php
// Dev router for PHP's built-in server (`npm run dev`, start-test-server.command).
// Mimics the nginx rules in nginx-example.config:
//   try index.php, then index.html, then fall through to dynamic.php.
//   proxy.php is never served directly.
// Adds two dev-only routes that nginx does not have:
//   /sitemap      the gloomap viewer from tools/
//   /gloomap.xml  the site map it reads
$root = $_SERVER['DOCUMENT_ROOT'];
$uri  = rawurldecode(strtok($_SERVER['REQUEST_URI'], '?'));

if ($uri === '/proxy.php') { http_response_code(404); exit; }

if ($uri === '/sitemap') {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/gloomap-viewer.html');
    exit;
}
if ($uri === '/gloomap.xml') {
    header('Content-Type: application/xml; charset=utf-8');
    readfile(dirname(__DIR__) . '/gloomap.xml');
    exit;
}

$path = $root . $uri;
if (is_file($path)) {
    if (str_ends_with($path, '.php')) { require $path; exit; }
    return false; // let the built-in server send the static file
}
if (is_dir($path)) {
    if (is_file("$path/index.php"))  { require "$path/index.php"; exit; }
    if (is_file("$path/index.html")) { readfile("$path/index.html"); exit; }
}
require "$root/dynamic.php";

<?php
// Dev router for PHP's built-in server (`npm run dev`, start-test-server.command).
// Mimics the nginx rules in nginx-example.config:
//   try index.php, then index.html, then fall through to dynamic.php.
//   proxy.php is never served directly.
$root = $_SERVER['DOCUMENT_ROOT'];
$uri  = rawurldecode(strtok($_SERVER['REQUEST_URI'], '?'));

if ($uri === '/proxy.php') { http_response_code(404); exit; }

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

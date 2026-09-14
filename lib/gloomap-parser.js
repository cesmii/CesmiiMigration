/**
 * gloomap-parser.js
 *
 * Parses a Gloomaps XML export into a navigation tree used to build the site nav.
 *
 * URL convention in gloomap box text (two-line format):
 *   Box Label
 *   #https://43818189.hs-sites.com/some-page   ← page proxied by proxy.php
 *
 * The URL host must be one of HS_ALLOWED_HOSTS in proxy.php. A box with no URL
 * line is nav structure only: it appears in the menu but no page is generated.
 *
 * Structural boxes (Footer, Top Nav, Legend, Notes) and any box with a black
 * background (#000000) are filtered out — they are planning artifacts, not nav items.
 */

const fs = require('fs');
const xml2js = require('xml2js');

const STRUCTURAL_LABELS = new Set(['Footer', 'Top Nav', 'Legend', 'Notes']);
const STRUCTURAL_BG = '#000000';

function str(val) {
  if (!val) return '';
  return Array.isArray(val) ? (val[0] || '') : val;
}

/**
 * Split a box's raw text into a display label and an optional URL.
 * The URL line starts with '#' and may be on the same or a subsequent line.
 */
function parseTextAndUrl(rawText) {
  const lines = str(rawText).split('\n').map((l) => l.trim()).filter(Boolean);
  const urlLineIndex = lines.findIndex((l) => l.startsWith('#'));

  const label = urlLineIndex === -1
    ? lines.join(' ')
    : lines.slice(0, urlLineIndex).join(' ') || lines[0];

  let url = urlLineIndex !== -1 ? lines[urlLineIndex].slice(1).trim() : null;
  // Upgrade http to https — hs_fetch() only accepts https URLs.
  if (url && url.startsWith('http://')) url = url.replace('http://', 'https://');
  // Gloomaps strips "&" from box text, leaving double spaces — restore them
  const cleanLabel = label.trim().replace(/\s{2,}/g, ' & ');
  return { label: cleanLabel, url };
}

/**
 * Convert a display label to a URL-safe slug.
 * "Board of Directors" → "board-of-directors"
 */
function toSlug(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Recursively parse an array of xml2js box objects into nav nodes.
 * parentPath is the accumulated path prefix, e.g. "/about".
 */
function parseBoxes(boxes, parentPath) {
  if (!Array.isArray(boxes)) return [];

  return boxes
    .map((box) => {
      const { label, url } = parseTextAndUrl(box.text);
      const bg = str(box.propa);

      if (!label || STRUCTURAL_LABELS.has(label) || bg === STRUCTURAL_BG) return null;

      const slug = toSlug(label);
      const localPath = parentPath ? `${parentPath}/${slug}` : `/${slug}`;

      // xml2js represents <member/> as '' and <member><box>...</box></member> as [{box:[...]}]
      const memberVal = box.member;
      const memberObj = Array.isArray(memberVal) && memberVal.length > 0 && typeof memberVal[0] === 'object'
        ? memberVal[0]
        : null;
      const childBoxes = memberObj && Array.isArray(memberObj.box) ? memberObj.box : [];

      const children = parseBoxes(childBoxes, localPath);

      return { label, url, localPath, children };
    })
    .filter(Boolean);
}

/**
 * Load and parse gloomap.xml.
 *
 * Returns:
 *   {
 *     homepageUrl: string|null,   // URL from the root "cesmii.org" box, if set
 *     navItems: NavNode[],        // top-level nav items (each may have .children)
 *   }
 *
 * NavNode shape:
 *   { label, url: string|null, localPath, children: NavNode[] }
 */
async function loadNavFromGloomap(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const result = await xml2js.parseStringPromise(xml);

  const rootBox = result.gloomaps.section[0].box[0];
  const { url: homepageUrl } = parseTextAndUrl(rootBox.text);

  const memberObj = Array.isArray(rootBox.member) && rootBox.member.length > 0 && typeof rootBox.member[0] === 'object'
    ? rootBox.member[0]
    : null;
  const topLevelBoxes = memberObj && Array.isArray(memberObj.box) ? memberObj.box : [];

  const navItems = parseBoxes(topLevelBoxes, '');

  return { homepageUrl, navItems };
}

module.exports = { loadNavFromGloomap };

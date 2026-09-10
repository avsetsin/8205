import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');
const html = read('index.html');
const activeHtml = html.replace(/<!--[\s\S]*?-->/g, '');
const css = read('styles.css');
const js = read('main.js');
const headers = read('_headers');
const assetsIgnore = read('.assetsignore');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function parseAttributes(tag, reportDuplicates = true) {
  const attributes = new Map();
  const name = tag.match(/^<[A-Za-z][^\s/>]*/)?.[0] ?? '';
  const body = tag.slice(name.length, tag.endsWith('/>') ? -2 : -1);
  const pattern = /(?:^|\s)([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(pattern)) {
    const key = match[1].toLowerCase();
    if (attributes.has(key)) {
      if (reportDuplicates) failures.push(`duplicate ${key} attribute: ${tag}`);
      continue;
    }
    attributes.set(key, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function scanStartTags(source) {
  const tags = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '<' || !/[A-Za-z]/.test(source[start + 1] ?? '')) continue;
    let quote = '';
    let end = start + 1;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
    }
    if (end === source.length) {
      failures.push(`unterminated start tag at byte ${start}`);
      break;
    }
    const tag = source.slice(start, end + 1);
    const name = tag.match(/^<([A-Za-z][^\s/>]*)/)?.[1].toLowerCase() ?? '';
    tags.push({
      name,
      source: tag,
      start,
      end: end + 1,
      attributes: parseAttributes(tag)
    });
    if (['script', 'style', 'textarea', 'title'].includes(name)) {
      const closingTag = new RegExp(`<\\/${name}\\s*>`, 'gi');
      closingTag.lastIndex = end + 1;
      const closing = closingTag.exec(source);
      if (!closing) {
        failures.push(`${name} element at byte ${start} has no closing tag`);
        break;
      }
      start = closing.index + closing[0].length - 1;
      continue;
    }
    start = end;
  }
  return tags;
}

const startTags = scanStartTags(activeHtml);
const tagsNamed = (name) => startTags.filter((tag) => tag.name === name);
const hasClass = (tag, className) => (tag.attributes.get('class') ?? '').split(/\s+/).includes(className);

// Cloudflare publishes the repository root. New root entries must be explicitly public or excluded.
const publicRootEntries = new Set([
  '_headers',
  'apple-touch-icon.png',
  'assets',
  'favicon.ico',
  'favicon.svg',
  'index.html',
  'llms.txt',
  'main.js',
  'robots.txt',
  'sitemap.xml',
  'styles.css'
]);
const excludedRootEntries = new Set(assetsIgnore.split(/\r?\n/).map((entry) => entry.replace(/\/$/, '')).filter(Boolean));
const unclassifiedRootEntries = readdirSync(root, { withFileTypes: true })
  .map((entry) => entry.name)
  .filter((name) => !publicRootEntries.has(name) && !excludedRootEntries.has(name));
check(unclassifiedRootEntries.length === 0, `unclassified publish-root entries: ${unclassifiedRootEntries.join(', ')}`);

// Source architecture and executable-code boundary.
check(!/\sstyle\s*=/i.test(activeHtml), 'inline style attributes are forbidden');
check(!/\son[a-z]+\s*=/i.test(activeHtml), 'inline event handlers are forbidden');
check(!css.includes('!important'), 'CSS must not rely on !important');
check(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(js), 'main.js must not evaluate arbitrary code');

const scriptTags = startTags.filter((tag) => tag.name === 'script').map((tag) => {
  const closingTag = /<\/script\s*>/gi;
  closingTag.lastIndex = tag.end;
  const closing = closingTag.exec(activeHtml);
  if (!closing) failures.push(`script element at byte ${tag.start} has no closing tag`);
  return { attributes: tag.attributes, body: closing ? activeHtml.slice(tag.end, closing.index).trim() : '' };
});
const jsonBlocks = scriptTags.filter(({ attributes }) => attributes.get('type') === 'application/ld+json');
const executableScripts = scriptTags.filter(({ attributes }) => attributes.get('type') !== 'application/ld+json');
check(executableScripts.length === 1, 'exactly one executable script is expected');
if (executableScripts.length === 1) {
  const [{ attributes, body }] = executableScripts;
  const scriptSource = attributes.get('src') || '';
  check(/^\/main\.js\?v=\d{8}-\d+$/.test(scriptSource) && attributes.has('defer') && body === '', 'the executable script must be deferred, versioned /main.js with no inline body');
}
check(jsonBlocks.length > 0, 'structured data is missing');
const structuredDataNodes = [];
for (const { body } of jsonBlocks) {
  try {
    const value = JSON.parse(body);
    const nodes = Array.isArray(value) ? value : Array.isArray(value?.['@graph']) ? value['@graph'] : [value];
    structuredDataNodes.push(...nodes.filter((node) => node && typeof node === 'object' && !Array.isArray(node)));
  } catch (error) {
    failures.push(`structured data is invalid JSON: ${error.message}`);
  }
}
for (const [type, requiredFields] of [
  ['WebSite', ['@id', 'url']],
  ['TechArticle', ['@id', 'mainEntityOfPage']],
  ['FAQPage', ['@id', 'mainEntity']]
]) {
  const node = structuredDataNodes.find((candidate) => candidate['@type'] === type);
  check(node && requiredFields.every((field) => node[field]), `structured data is missing a usable ${type}`);
}

// Stable document and accessibility invariants. These do not freeze copy or component counts.
check(tagsNamed('main').length === 1, 'exactly one main landmark is required');
check(tagsNamed('h1').length === 1, 'exactly one h1 is required');
check(tagsNamed('nav').length >= 1, 'a navigation landmark is required');
check(tagsNamed('a').some((tag) => hasClass(tag, 'skip-link') && tag.attributes.get('href') === '#main-content'), 'the skip link must target #main-content');
check(tagsNamed('table').length > 0 && tagsNamed('caption').length > 0 && tagsNamed('th').some((tag) => ['row', 'col'].includes(tag.attributes.get('scope'))), 'the comparison must remain a labelled semantic table');
for (const variant of ['protected', 'services', 'unknown']) {
  check(startTags.filter((tag) => hasClass(tag, `stake-chart__${variant}`)).length === 1, `stake chart must contain one ${variant} segment`);
  check(startTags.filter((tag) => hasClass(tag, `stake-legend__swatch--${variant}`)).length === 1, `stake legend must contain one ${variant} swatch`);
}
const faqItems = tagsNamed('details').filter((tag) => hasClass(tag, 'faq-item')).length;
check(faqItems > 0 && tagsNamed('summary').filter((tag) => hasClass(tag, 'faq-q')).length === faqItems, 'every FAQ disclosure must have a summary');

const cubeGroups = startTags.filter((tag) => tag.attributes.has('data-cube-group')).map((tag) => tag.attributes.get('data-cube-group')).sort();
const cubeBeats = startTags.filter((tag) => tag.attributes.has('data-beat')).map((tag) => tag.attributes.get('data-beat')).sort();
check(cubeGroups.length > 0 && JSON.stringify(cubeGroups) === JSON.stringify(cubeBeats), 'attack cube groups and narrative beats must stay paired');

// IDs, fragments, images, and local references.
const ids = startTags.filter((tag) => tag.attributes.has('id')).map((tag) => tag.attributes.get('id'));
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
check(duplicateIds.length === 0, `duplicate IDs: ${[...new Set(duplicateIds)].join(', ')}`);
for (const tag of tagsNamed('a')) {
  const href = tag.attributes.get('href') ?? '';
  if (href.startsWith('#')) check(ids.includes(href.slice(1)), `missing fragment target: ${href}`);
}

for (const tag of tagsNamed('img')) {
  check(tag.attributes.has('alt'), `image is missing alt text: ${tag.source}`);
  check(/^\d+$/.test(tag.attributes.get('width') ?? '') && /^\d+$/.test(tag.attributes.get('height') ?? ''), `image is missing intrinsic dimensions: ${tag.source}`);
}
for (const tag of tagsNamed('a').filter((tag) => tag.attributes.get('target') === '_blank')) {
  const rel = (tag.attributes.get('rel') ?? '').split(/\s+/);
  check(rel.includes('noopener') || rel.includes('noreferrer'), `new-window link is missing rel=noopener/noreferrer: ${tag.source}`);
}

const localRefs = [];
for (const tag of startTags) {
  for (const attribute of ['href', 'src']) if (tag.attributes.has(attribute)) localRefs.push(tag.attributes.get(attribute));
  if (tag.attributes.has('srcset')) {
    for (const candidate of tag.attributes.get('srcset').split(',')) localRefs.push(candidate.trim().split(/\s+/)[0]);
  }
}
for (const source of [activeHtml, css]) {
  for (const [, , ref] of source.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)) localRefs.push(ref);
}
for (const ref of localRefs) {
  if (/^(?:mailto:|tel:|data:|#)/i.test(ref)) continue;
  try {
    const url = new URL(ref, 'https://eip8205.com/');
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'https://eip8205.com') {
      check(url.hostname !== 'eip8205.com', `same-site reference must use the canonical HTTPS origin: ${ref}`);
      continue;
    }
    if (url.origin !== 'https://eip8205.com') {
      failures.push(`unsupported local reference scheme: ${ref}`);
      continue;
    }
    if (url.hash) check(ids.includes(decodeURIComponent(url.hash.slice(1))), `missing fragment target: ${url.hash}`);
    const encodedSeparator = /%2f|%5c/i.test(url.pathname);
    const decoded = decodeURIComponent(url.pathname);
    const unsafeSegment = decoded.split('/').some((segment) => segment === '.' || segment === '..') || decoded.includes('\\') || decoded.includes('\0');
    if (encodedSeparator || unsafeSegment) {
      failures.push(`ambiguous local reference path: ${ref}`);
      continue;
    }
    const clean = posix.normalize(decoded);
    const relative = clean === '/' ? 'index.html' : clean.replace(/^\//, '');
    const topLevel = relative.split('/')[0];
    check(publicRootEntries.has(topLevel), `local reference points outside the deploy surface: ${ref}`);
    check(relative && existsSync(resolve(root, relative)), `missing local reference: ${ref}`);
  } catch (error) {
    failures.push(`invalid local reference ${ref}: ${error.message}`);
  }
}

function listFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(resolve(directory, entry.name), relative) : [relative];
  });
}

const referencedAssets = new Set(Array.from([activeHtml, css, read('llms.txt')].join('\n').matchAll(/\/assets\/[A-Za-z0-9._/-]+/g), (match) => match[0].replace(/[).,;]+$/, '')));
const orphanedAssets = listFiles(resolve(root, 'assets'))
  .map((file) => `assets/${file}`)
  .filter((file) => !file.startsWith('assets/social/'))
  .filter((file) => !file.endsWith('-OFL.txt'))
  .filter((file) => !referencedAssets.has(`/${file}`));
check(orphanedAssets.length === 0, `unreferenced deploy assets: ${orphanedAssets.join(', ')}`);

// Project-specific correctness and deployment policy.
const activeText = `${html}\n${read('llms.txt')}`;
for (const [label, pattern] of [
  ['historical source_address field', /source_address/i],
  ['historical finalized-slot expiry', /finalized[-_ ]slot/i],
  ['historical 0x0E domain or type', /\b0x0e[0-9a-f]*\b/i],
  ['historical 0x0F domain or type', /\b0x0f[0-9a-f]*\b/i],
  ['historical 2**22 limit', /2\s*\*\*\s*22/],
  ['historical 196-byte format', /\b196[- ]byte/i],
  ['historical 204-byte format', /\b204[- ]byte/i],
  ['historical fork name', /Glamsterdam/i],
  ['placeholder EIP number', /EIP-X{4}/i],
  ['subdirectory deployment prefix', /\/8205\//]
]) {
  check(!pattern.test(activeText), `forbidden ${label} found`);
}

const headerLines = headers.split(/\r?\n/);
const firstHeaderRule = headerLines.findIndex((line) => line.trim());
check(firstHeaderRule >= 0 && headerLines[firstHeaderRule] === '/*', '_headers must begin with the global /* route');
const globalHeaders = new Map();
if (firstHeaderRule >= 0 && headerLines[firstHeaderRule] === '/*') {
  for (let index = firstHeaderRule + 1; index < headerLines.length; index += 1) {
    const line = headerLines[index];
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) break;
    const match = line.match(/^\s+([^:]+):\s*(.*)$/);
    if (!match) {
      failures.push(`malformed global header line: ${line.trim()}`);
      continue;
    }
    const name = match[1].toLowerCase();
    if (globalHeaders.has(name)) failures.push(`duplicate global response header: ${match[1]}`);
    else globalHeaders.set(name, match[2]);
  }
}

const csp = globalHeaders.get('content-security-policy') ?? '';
const cspDirectives = new Map();
const duplicateCspDirectives = [];
for (const directive of csp.split(';').map((value) => value.trim()).filter(Boolean)) {
  const [name, ...sources] = directive.split(/\s+/);
  if (cspDirectives.has(name)) duplicateCspDirectives.push(name);
  cspDirectives.set(name, sources);
}
check(duplicateCspDirectives.length === 0, `duplicate CSP directives: ${duplicateCspDirectives.join(', ')}`);
for (const [name, requiredSources] of [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  ['frame-ancestors', ["'none'"]],
  ['connect-src', ["'none'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'"]],
  ['font-src', ["'self'"]]
]) {
  const sources = cspDirectives.get(name) ?? [];
  check(JSON.stringify(sources) === JSON.stringify(requiredSources), `CSP ${name} must be ${requiredSources.join(' ')}`);
}
check(!csp.includes("'unsafe-inline'") && !csp.includes("'unsafe-eval'"), 'CSP must not allow unsafe inline or evaluated code');
for (const [name, value] of [
  ['strict-transport-security', 'max-age=31536000'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY']
]) {
  check(globalHeaders.get(name) === value, `global ${name} header must be ${value}`);
}
check(globalHeaders.has('permissions-policy'), 'global permissions-policy header is missing');
check(!/https:\/\/fonts\.(?:googleapis|gstatic)\.com/.test(`${activeHtml}\n${css}\n${headers}`), 'runtime Google Fonts dependencies are forbidden');

const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
check(/(?:^|\n)Sitemap:\s+https:\/\/eip8205\.com\/sitemap\.xml\s*(?:\n|$)/i.test(robots), 'robots.txt must advertise the canonical sitemap');
check(/<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"[^>]*>/.test(sitemap), 'sitemap.xml must use the sitemap protocol namespace');
check(/<loc>https:\/\/eip8205\.com\/<\/loc>/.test(sitemap), 'sitemap.xml must include the canonical homepage');

for (const [optimized, fallback] of [
  ['assets/talk-lido.webp', 'assets/talk-lido.jpg'],
  ['assets/talk-ethprague.webp', 'assets/talk-ethprague.jpg'],
  ['assets/delegator-attack.webp', 'assets/delegator-attack.jpg'],
  ['assets/operator-attack.webp', 'assets/operator-attack.jpg'],
  ['assets/rails.webp', 'assets/rails.png'],
  ['assets/idle-coin.webp', 'assets/idle-coin.png']
]) {
  const optimizedPath = resolve(root, optimized);
  const fallbackPath = resolve(root, fallback);
  check(existsSync(optimizedPath) && existsSync(fallbackPath), `missing optimized image pair: ${optimized} / ${fallback}`);
  if (existsSync(optimizedPath) && existsSync(fallbackPath)) {
    const webp = readFileSync(optimizedPath);
    check(webp.length >= 12 && webp.subarray(0, 4).toString('ascii') === 'RIFF' && webp.subarray(8, 12).toString('ascii') === 'WEBP', `${optimized} is not a WebP file`);
    check(statSync(optimizedPath).size < statSync(fallbackPath).size, `${optimized} is not smaller than its fallback`);
  }
}
for (const license of ['assets/fonts/Archivo-OFL.txt', 'assets/fonts/Archivo-Black-OFL.txt', 'assets/fonts/IBM-Plex-Mono-OFL.txt']) {
  check(existsSync(resolve(root, license)), `missing font license: ${license}`);
}

const socialCardPath = resolve(root, 'assets/social/og-default.png');
if (existsSync(socialCardPath)) {
  const socialCard = readFileSync(socialCardPath);
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  check(socialCard.length >= 24 && socialCard.subarray(0, 8).equals(pngSignature), 'default social card must be a PNG');
  if (socialCard.length >= 24) check(socialCard.readUInt32BE(16) === 1200 && socialCard.readUInt32BE(20) === 630, 'default social card must be 1200x630');
} else {
  failures.push('default social card is missing');
}

if (failures.length) {
  console.error(`Static integrity failed with ${failures.length} issue${failures.length === 1 ? '' : 's'}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Static integrity passed: ${localRefs.length} local-reference candidates, ${ids.length} IDs, ${faqItems} FAQ disclosures.`);
}

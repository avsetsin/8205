# EIP-8205 landing page

This repository contains the static, non-normative landing page published at <https://eip8205.com/>. It has no build step or runtime application dependency: Cloudflare serves the repository root as HTML, CSS, a small same-origin progressive-enhancement script, text, XML, and image assets.

## Source hierarchy

The landing page explains the proposal; it does not define it. Check technical claims against the current [EIP](https://eips.ethereum.org/EIPS/eip-8205), the merged [consensus specification](https://github.com/ethereum/consensus-specs/tree/master/specs/_features/eip8205), and the [system-contract implementation](https://github.com/ethereum/sys-asm/pull/55), in that order. Stop and resolve material disagreements before updating public copy.

## Files

- `index.html` contains semantic page content, metadata, the authoritative `WebSite`/`TechArticle`/`FAQPage` structured-data graph, and one deferred reference to `/main.js`. It contains no visual style declarations, inline event handlers, or inline executable scripts.
- `styles.css` is the single visual source of truth. It is organized as tokens, base rules, layout primitives, page components, interaction states, motion, and responsive/accessibility overrides.
- `main.js` progressively enhances the desktop attack sequence, fine-pointer artwork tilt, and FAQ disclosure motion. All content and native disclosure controls remain usable without JavaScript, and the enhancement observes reduced-motion and pointer-capability preferences.
- Native HTML provides the interaction model: FAQ disclosure uses `details` and `summary`, repeated processes use lists, and all content works without JavaScript. Markerless native lists deliberately retain `role="list"` so Safari and VoiceOver do not drop their list semantics.
- `robots.txt`, `sitemap.xml`, and `llms.txt` provide crawler and machine-readable entry points.
- `_headers` defines source-controlled security headers for Cloudflare static assets, including a CSP that permits only same-origin external scripts and styles while forbidding unsafe inline or evaluated code.
- `.assetsignore` defines the intended non-public files when Cloudflare deploys this root through Workers Static Assets. The source-integrity check classifies every top-level entry as public or excluded; release verification must still confirm that the owner-controlled Cloudflare build actually uses this assets directory and ignore file.
- `assets/social/` contains the current social card set; the default Open Graph card is 1200×630.
- `assets/fonts/` contains the versioned Latin WOFF2 files used by the page and their upstream SIL Open Font License texts; the page makes no runtime font request to a third party.
- `scripts/qa.mjs` is a dependency-free source-integrity check used locally and in GitHub Actions. It checks repository invariants; it is not a browser, layout, accessibility, or production-deployment test.

## Local QA

Run `make serve`, then open <http://127.0.0.1:4173/>. In another terminal run `make check`. The check validates JavaScript syntax, sitemap XML parsing, the publish surface, local references, JSON-LD structure, essential document semantics, CSP boundaries, optimized assets, font licenses, and known historical proposal values. It deliberately does not claim to validate rendering or production behavior. Before release, test keyboard-only navigation, animations and reduced motion, 200% and 400% zoom, and representative phone, tablet, and desktop widths.

## Release model

Cloudflare Workers Builds deploys the root of `main` to the canonical apex domain. A page change is not live until it is committed and pushed in this repository; updating a parent-repository submodule pointer does not publish it. Treat every push to `main` as a production release, verify the Cloudflare build SHA, inspect the canonical URL, and keep the prior good commit available for rollback.

Repository owners should protect `main`, require review and the check emitted by `.github/workflows/qa.yml`, and prevent direct pushes. After its first run, select the exact check context shown by GitHub in branch-protection settings. Cloudflare should redirect every HTTP and `www` request to the canonical HTTPS apex, keep preview deployments out of search indexes, and expose a documented rollback path. These account-level settings cannot be enforced from this repository.

## External release checks

The repository cannot verify Cloudflare account security, DNS, real-device assistive technology, search-engine recrawl state, social-network caches, or the legal provenance of existing images. Before a broad campaign, an owner should confirm asset rights, run the major social-card debuggers, submit the sitemap in Google Search Console and Bing Webmaster Tools, and manually exercise VoiceOver or NVDA plus iOS Safari and Android Chrome. The current social card set is technically complete; no additional illustration is required for this release.

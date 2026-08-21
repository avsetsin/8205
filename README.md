# EIP-8205 landing page

The source of the advocacy one-pager for [EIP-8205: Withdrawal credentials preregistration](https://eips.ethereum.org/EIPS/eip-8205), published with GitHub Pages at <https://avsetsin.github.io/8205/>.

EIP-8205 addresses first-deposit front-running in delegated staking. A validator key holder signs a binding between a validator public key and withdrawal credentials before the first deposit; the consensus layer then rejects a protected deposit that carries different credentials. The page explains the problem, what protocols pay to defend against it today, and what the proposal changes.

## Running it

There is no build step and no package to install. Open `index.html` directly, or serve the directory:

```sh
python3 -m http.server 8000
```

| Path | Role |
| --- | --- |
| `index.html` | The whole page. Layout lives in inline `style` attributes |
| `styles.css` | Only what an inline attribute cannot express: two element resets, the keyframes, the `data-*` responsive rules, and the six `:hover` states |
| `main.js` | Scroll-linked beat opacity, the rotating card ring, and pointer tilt on the hero and the ring |
| `assets/` | Eight images, all referenced by the page |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

The only external request is the Google Fonts stylesheet for Archivo, Archivo Black, and IBM Plex Mono.

## Before publishing a change

Every parameter and behavioral claim on the page is derived, not normative. Recheck each one against the EIP text and the executable consensus specification, and recheck the status, voting, ranking, and media links, which change independently of this repository:

- [EIP-8205](https://eips.ethereum.org/EIPS/eip-8205) — the proposal and the execution-layer contract requirements
- [ethereum/consensus-specs#5548](https://github.com/ethereum/consensus-specs/pull/5548) — consensus-layer specification and tests
- [ethereum/sys-asm#55](https://github.com/ethereum/sys-asm/pull/55) — execution-layer system contract
- [Ethereum Magicians thread](https://ethereum-magicians.org/t/eip-8205-withdrawal-credentials-preregistration/28084) — discussion

This page is produced in the EIP-8205 working repository, which holds the specifications, implementations, reviews, and the design history behind it. The locked style specification and the Claude Design canvas this page was derived from are preserved there under `archive/landing/`.

# Northline Site System

A production system for building high-end, lead-generating websites for the
Alaska market. One engine, many client sites.

The premise: the WebGL wins the sale, the performance and SEO layer keeps the
client. Both ship, and neither is allowed to cost the other.

## Layout

```
packages/
  engine/       WebGL core — tier detection, render stage, scroll, scenes
sites/
  flagship/     Northline's own showcase site (the demo that sells)
scripts/
  verify.mjs    Verification harness (bundle, crawlability, all 3 tiers)
```

## The three-tier contract

Every site renders in one of three modes, chosen per visitor at runtime by
`packages/engine/src/core/Capability.ts`:

| Tier | Who gets it | What ships |
|---|---|---|
| 3 | WebGPU-class desktops | Full aurora shader, 5-octave noise, pointer parallax |
| 2 | Ordinary laptops (WebGL2) | Same shader, reduced detail, capped pixel ratio |
| 1 | Phones, slow connections, reduced-motion | **No WebGL downloaded at all** — designed static poster, full content |

Tier 1 is a first-class design target, not a fallback: it is what most local
lead traffic actually sees, and it is where the click-to-call bar lives.

## The LCP rule

The hero headline, subhead, and CTAs are static HTML with a pure-CSS poster.
Three.js loads via dynamic `import()` **after** the `load` event and cross-fades
in. The entry chunk is ~3 KB gzip; Three.js (~115 KB gzip) is a separate lazy
chunk that Tier 1 never requests. `scripts/verify.mjs` fails if Three.js leaks
into the entry chunk.

## Commands

```sh
pnpm install
pnpm dev        # flagship dev server
pnpm build      # build all packages
pnpm verify     # build checks + JS-disabled crawl + screenshots of all 3 tiers
pnpm typecheck
```

## Adding a client site

Copy `sites/flagship`, then change: content in `index.html`, palette tokens in
`src/styles/main.css`, aurora colors passed to `boot()` in `src/main.ts`, and
set `VITE_LEAD_ENDPOINT` to the client's lead destination. The engine is a
workspace dependency and stays untouched.

## Provenance

All shader code and design in this repo is original work. The visual direction
(aurora, cold palette, monospace labels) is inspired by the general genre of
high-end WebGL sites, not copied from any existing site or codebase.

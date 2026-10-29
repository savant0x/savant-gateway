# Session Summary: 2026-10-29 — launch planning and visual direction

**Session ID:** 2026-10-29-launch-and-visual-direction
**Status:** complete

## Initial State

- Windows, PowerShell, Next.js 16.4.3, HeroUI 3.2.7, Font Awesome Free 6.7.2.
- `main` at `cdb3ad0`, 16 commits ahead of local `origin/main`.
- No tracked source edits; `.savant/`, `debug/`, `dev/audit/` are local-only.
- Provider wallet funding and Stripe setup are reserved for near launch by
  explicit operator instruction, quoted in `docs/launch-readiness.md`.

## Planned Work

1. [x] Document launch requirements and distinguish intended trial conversion
   from existing daily allowances.
2. [x] Prepare a substantially redesigned cyan neon-noir visual direction.
3. [x] Present the concrete design for review before site implementation.
4. [x] After direction approval, converge an implementation FID and apply the
   design across public pages, authentication, account, console, and admin.

## Work Completed

- Added `docs/launch-readiness.md`: trial ledger and model pairing, shared
  capacity, payment setup, funding, abuse controls, operational deployment,
  acceptance tests, and current evidence boundaries.
- Initialized `.superdesign/init/` and `.superdesign/design-system.md`.
- Created the design project and uploaded the original `assets/logo.png`.
- Captured a baseline homepage and requested a full visual recomposition.
  The baseline is a comparison record, not the proposed design.
- No production application code, package dependencies, credentials, or
  customer data were changed during design preparation.

## Design Direction

Operator clarification: "Savant as a brand is designed w/ cyberpunk/neon noir
visuals. Cyan being the primary clogo color. W/ neon accents".

Further direction: "I don't want a simple 'clone' provider. I want it visually
distinct and stunning."

The proposed composition uses monumental display typography, the actual cyan
portrait, architectural spacing, an editorial model table, a request/response
workbench, and concise developer-facing copy. The intent is substantial
recomposition, not recoloring the current layout. HeroUI v3 and Font Awesome
Free remain the implementation foundation. No new package was needed yet.

Canvas: https://superdesign.dev/teams/8a802e29-1503-40f3-a5cd-f17bdbfbbd42/projects/dfc3209e-6b4b-4cdb-b220-cead96e04215

## Validation Results

`npm run verify` completed with exit 0 during this records/design preparation:

```text
lint: exit 0
typecheck: exit 0
tests 107
pass 107
fail 0
quality: PASS (400-line ceiling, 189 files scanned)
Compiled successfully
51-route production build
http-suite: 100 checks PASS
```

`git diff --check` also exited 0. These gates verify the current application;
they do not validate a redesign that has not been implemented.

## Remaining Work

The current homepage draft is version 7. The operator supplied the core product
reference at `C:/Users/spenc/dev/savant-code/assets/landing.html`, inspected
read-only and rendered for visual reference. The reference anchors Orbitron,
Rajdhani, JetBrains Mono, cyan #00fbff and magenta #ff2a6d. The operator rejected
the after-dark positioning and requested a focus on price and quality.

Version 6 is a directly authored design with the headline "Frontier models.
Grounded prices.", a model-family selector that updates illustrative rates,
a pricing table, value explanation, and a copyable request example. The actual
logo exists in all three intended positions. Desktop (1440px) and mobile
(390px and 320px) rendered checks found matching viewport/document widths after
the table's positioned overflow boundary was corrected. A model-selector check
returned `claude-sonnet-5.5 $0.52`. Sample prices are labelled illustrative.
No production application code changed. Preview:
https://p.superdesign.dev/draft/0fb14ec2-d02c-472a-9d94-879cae0f7bfc

Version 7 responds to the operator's full-catalog correction. A read-only query
of the gateway's public model fields supplied all 45 enabled/in-catalog rows.
The preview renders the full snapshot with search, billing filters, context,
configured sell prices, and explicit subscription inclusion labels. It does
not claim this stored catalog is a freshly synchronized upstream catalog.
Rendered IDs matched all 45 database IDs; search found all 5 Claude variants;
the subscription filter found 10 models; empty results were explicit; and the
GPT selector preserved $0.40 input / $0.60 output instead of assuming equality.
No document overflow at 1440, 390, or 320 pixels. Production will consume the
store directly when the design is implemented.

The operator's `resume` authorized implementation of version 7. FID-013
converged before production edits. The real site now uses Orbitron, Rajdhani,
JetBrains Mono, semantic light/dark palettes, shared branding/navigation,
price-focused landing composition, and all enabled catalog models. Public,
auth, account, console and admin shells share the system. The price engine
uses configured retail values rather than the preview snapshot.

Production-build browser receipt on a disposable database: 17 routes × two
themes × three widths (1440/390/320) returned 200 without document overflow.
Seventeen checks passed for 45 catalog rows, five Claude search results, ten
subscription results, empty search/catalog states, unequal $0.40/$0.60 GPT
rates, mobile navigation, keyboard focus, reduced motion and payment guidance.
The first pass found account/console intrinsic-width overflow; shared card/grid
constraints corrected it. Customer payment setup commands were replaced with
availability guidance, and the error boundary no longer displays raw errors.

Implementation gates: typecheck, 107 unit tests, quality PASS over 191 files,
51-route build, and 100 HTTP checks passed. A final lint run exited 0 with zero
warnings after formatting corrections. Reachability search confirms the root
CSS/font imports, shared BrandMark callers, Hero → ModelPriceEngine, and
app/page → getLandingData → full listModels path. Browser screenshots remain
local under ignored `.superdesign/tmp/`.

Implementation committed as `56a2436`; FID-013 closed against that commit and
moved to `dev/fids/archive/`. The changelog records its verification evidence.
Design resume fingerprints describe the pre-implementation source snapshot;
refresh them before a future design iteration. The implementation is the
production source of truth; the canvas remains the reviewed version-7 design.

The trial conversion is not enabled; launch requirements remain unchecked
until implemented and independently verified.

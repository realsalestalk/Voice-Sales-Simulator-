# Survival League

A mobile-friendly **crypto research and paper-trading laboratory** — a demonstration.

Five researchers, ten strategy bots, an independent evidence reviewer (Ava) and a head coach (Sam)
turn shared market observations into written, checkable **paper** decisions, starting from **$500
of simulated capital** split into ten separate $50 accounts.

> **Everything here is a demonstration.** Prices, volume, funding and news items come from a seeded
> simulator. Alerts are previews and are never sent. There are **no live agents, no live market scans,
> no exchange connection and no order execution.** The “agents” are role definitions applied by a
> deterministic rules engine that runs in your browser.

## What is real

- The decision engine (`js/engine.js`): evidence review, source tracing, independence counting,
  freshness checks, individual and combined (correlation-cluster) risk limits, coach decisions and
  decision records — all unit-tested.
- Correlations are computed from the simulated returns; clusters use a 0.6 threshold.
- Decision records and improvement proposals persist in your browser's local storage only.

## Controls against shared mistakes

- Shared market observations reach every squad; research opinions stay inside their squad.
- Every claim keeps its original source, timestamp and dependencies; copies of one claim count once.
- Ava reviews each squad separately. Agreement is not evidence; disagreement alone does not sink a
  proposal whose evidence is complete.
- Missing required evidence blocks a proposal — nobody, including Sam, can override it.
- Individual limits (per $50 account) and combined limits (correlated cluster ≤ $125, total ≤ $300,
  one asset ≤ $100) both apply.
- These controls **reduce** correlated mistakes. They do not eliminate them.

## Pages

Overview · My team (interactive communication map) · Watchlist · Squads · Strategies · Safety rules ·
Research (pipeline lab, evidence registry, private notebooks) · Activity (decision records) ·
Training room · Growth lab (propose an improvement, compare on unseen bars, send for review).

## Sam and the 38-step walkthrough

Sam is rendered **from the approved reference footage**, not redrawn: his idle stance, walk cycle with
the cane, lifting the stick, the teaching pose with the real tapping arm, and lowering the stick are
keyed frames from the reference video (`tools/build_sam.py`). While he teaches, the baked stick is
removed and the same wooden stick is drawn from his real fist, under a separate fist layer, so it can
aim anywhere while the handle stays seated behind his fingers. Blinks and mouth movement during
teaching are subtle overlays on those frames.

The walkthrough (`js/steps.js`, `js/tour.js`) uses the real interface: Sam walks to each control,
settles, lifts the pointer, taps its centre three times with a blue ripple, then narrates. Placement
avoids covering the text being explained and is recalculated after scrolling, resizing, drawer
changes and folding. A frosted dock offers Back, Pause/Resume, Next/Finish and progress; chapters,
transcript, sound, device voice, auto-next, repeat and take-over live in the options menu (opening it
pauses; closing it restores your previous pause state).

**Voice:** Sam talks through the entire walkthrough. Each step has three spoken parts that run
alongside his movement: what he is heading to (while he walks), what he is pressing (while he taps),
and what happened and why it matters (after the result appears). Four lines are his approved
recordings, cut from the reference videos: “Take your time. I'll walk you through it.”, “I'll walk
you through it.”, “Choose an example, then press Next step.” and “See what comes in, what happens,
and what comes out.” Every other line (114 lines, about 10½ minutes) is pre-generated with the
open-source Kokoro-82M model (Apache-2.0) using a blend of stock voices chosen because it measured
closest to those recordings in timbre and pitch (`tools/samvoice.py`, `tools/build_voice.py`). It is
**not** a clone of Sam's voice, and the page says so. If sound is off or fails, the same lines run as
timed captions with matching mouth movement.

## Run and test

```bash
npm run serve            # static server on http://localhost:8080
npm test                 # engine + walkthrough unit tests (node --test)
npm run e2e              # Playwright: all 38 steps on 6 viewports + controls (server must be running)
```

## Limitations

- Simulated data only; one seeded price path. Paper outcomes are not forecasts or advice.
- Sam's expressions and head turns come from the reference frames; there is no free head rig.
- The generated narration voice resembles Sam's recordings but is not his voice.
- Samsung Fold7 sizes are tested with approximate CSS viewports in Chromium; physical-device testing
  is still required.

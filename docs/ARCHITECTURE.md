# Scanner v1 — Task-Based Audit Plan

**Goal:** Replace rule-based pillar scoring with task-based journey simulation. Remove snapshot 60-cap. Make UAI defensible under scrutiny.

---

## Page Selection (3 pages, purposeful)

Not 3 random crawl hits. Three role-typed pages, detected once at scan start:

1. **Home** — the landing URL the user provided. Tests arrival/orientation.
2. **Conversion** — the primary task page. `detectKeyPage(links, vertical)` already exists in scanner_v3.js:1382. Extend it:
   - ecommerce → product detail page (first `/product/`, `/p/`, `/item/` link)
   - banking/financial → login/auth page
   - saas → pricing or signup page
   - services → contact or booking page
3. **Form** — first URL containing a `<form>` with a submit button other than search. Crawl nav links, evaluate DOM.

If any role can't be detected, redistribute that page's weight to the remaining two. Never silently scan the home page three times.

---

## Simulation Harness (the seven tests)

Each task is a file under `shared/services/tasks/<task>.js` exporting:

```javascript
export async function run(page, context) {
    return {
        status: 'pass' | 'partial' | 'fail' | 'n/a',
        wcag_sc: ['2.4.1', '2.1.2'],
        evidence: { /* screenshot, stack, target */ },
        reason: 'Skip link exists but focus did not move to main'
    };
}
```

### T1. Keyboard traversal (20pt)
Press Tab up to 200 times from page load. Record `document.activeElement` tag/role at each step. **Fail** if focus cycles back to the same element twice without progression (trap). **Partial** if focus disappears into `body`. **Pass** if traversal reaches footer or hits end. WCAG 2.1.2, 2.4.3.

### T2. Skip-link functional (10pt)
Fresh page, press Tab once. Find first focusable link with text matching `/skip|jump/i`. Activate with Enter. Assert `document.activeElement` is inside `<main>` or `[role="main"]`. **Fail** if no skip link OR focus didn't move. **Partial** if link exists but focus moved to wrong region. WCAG 2.4.1.

### T3. Form error handling (15pt)
On form page: submit with all required fields empty. Wait 2s for client-side validation. Check every invalid input for (a) `aria-invalid="true"`, (b) `aria-describedby` pointing at an element containing error text, (c) an `aria-live` region or `role="alert"` announcing the error. **Fail** if none. **Partial** if only visual error. **Pass** if all three wired. WCAG 3.3.1, 3.3.3, 4.1.3.

### T4. Primary action keyboard-activatable (15pt)
On conversion page: locate primary CTA (largest button or button with text matching /buy|add to cart|sign up|get started|login/i). Tab to it. Press Enter. Check for navigation, modal, or DOM change within 3s. **Fail** if no response. Catches JS-only `onclick` handlers that ignore keyboard. WCAG 2.1.1.

### T5. Accessibility tree coherence (10pt)
`await page.accessibility.snapshot()`. Walk the tree. Count nodes with `role` in `[button, link, textbox, combobox, checkbox, radio]` that have empty `name`. **Fail** if >20% unlabeled. **Partial** if 5–20%. **Pass** if <5%. This is what screen readers actually see. WCAG 4.1.2.

### T6. Image alt quality (10pt)
Not "does alt exist" — "is alt meaningful." For each `<img>` with alt: reject if alt matches `/^(image|picture|photo|img|icon|logo)\s*\d*$/i`, matches filename pattern, or is a duplicate of 3+ other alts on the page. **Fail** if >30% bad. **Partial** if 10–30%. Pair with existing Uhallo image violation detection. WCAG 1.1.1.

### T7. Reflow + touch targets (10pt, home+conversion only)
Resize to 1280×800, then to 640×800. Check `document.documentElement.scrollWidth > window.innerWidth`. **Fail** if horizontal scroll. Then emulate `{ viewport: 390×844 }` and measure bounding box of every interactive element — **fail** if >10% are under 44×44. WCAG 1.4.10, 2.5.5.

**Orientation tasks (always run, 10pt combined):** lang attribute present + valid, single `<h1>`, at least one landmark (`main`, `nav`, `header`), `<title>` non-empty. Merge existing runLanguageCheck and heading logic.

---

## Scoring Algorithm

**Per-page score:**

```
page_score = Σ(task.weight × task_status_value) / Σ(applicable_task.weight) × 100

task_status_value: pass=1.0, partial=0.5, fail=0.0, n/a=omitted
```

**Journey weights:**

| Page | Weight | Tasks applicable |
|------|--------|------------------|
| Home | 30% | T1, T2, T5, T6, T7, orientation |
| Conversion | 40% | T1, T2, T4, T5, T6, T7, orientation |
| Form | 30% | T1, T3, T5, orientation |

**Final UAI:**

```
uai = Σ(page.weight × page.score) for detected pages
    / Σ(page.weight) for detected pages
```

No -15 penalty. No 60 cap. Snapshot and full audit use the same formula — full audit adds pages 4–20 with same task suite, weighted equally as "additional evidence" (+5% each, renormalized).

**Compliance (real, not derived):**

```
compliance = passed_wcag_sc_count / total_applicable_wcag_sc_count
```

Every task declares which WCAG SC it covers. If T2 fails, SC 2.4.1 is failed for this page. Aggregate across pages — a SC is "passed" only if it passed on every page it was tested. This is what WCAG conformance actually means, not `uai × 0.65`.

**Weakest-link floor:** keep the existing cap from uai-scoring.js — any task scoring 0 on a `weight ≥15` keeps the overall UAI capped at 60. Catastrophic failures don't hide behind averages.

---

## Implementation Phases

### Phase 1 — Harness (1 day)
- Create `shared/services/tasks/` directory
- Implement the 7 task files with the standard return shape
- Build `shared/services/task-runner.js` — takes page + page-type, runs applicable tasks in parallel where safe (T3 and T4 mutate state, run sequentially)
- Unit test each task file against a known-bad fixture HTML

### Phase 2 — Page detection (half day)
- Extend `detectKeyPage` in scanner_v3.js:1382 to return both conversion and form URLs
- Add `detectFormPage(links, homeHtml)` — scan for `<form>` elements
- Return `{ home, conversion, form }` from the existing discovery step

### Phase 3 — Scoring module (half day)
- New file `shared/services/uai-scoring-v2.js` with `computeJourneyScore(pageResults)`
- Keep existing `uai-scoring.js` untouched for full-audit tier regression safety — opt-in flag `SCORING_VERSION=v2`
- Implement real WCAG SC aggregation

### Phase 4 — Wire scanner_v3.js (half day)
- Replace `_scanPageCore` body: after navigation, call `taskRunner.run(page, pageType)` instead of the 15 parallel check functions
- Replace `mergePageScores` with `computeJourneyScore`
- Delete the snapshot cap block (lines 1637–1647)
- Keep axe-core results as supplementary evidence attached to the scoreData, not a score input

### Phase 5 — Validation (1 day)
- Re-run the 50 ecommerce sites behind `SCORING_VERSION=v2`
- Compare distributions side-by-side: v1 clusters at 60, v2 should show 20–95 spread
- Spot-check 5 sites manually with a screen reader — does the score match felt experience?
- If distribution looks right, flip default to v2

### Phase 6 — Migration cleanup (half day)
- Archive `uai-scoring.js` v1 under `.deprecated/`
- Update the UI scoreData consumer — pillar display becomes task-list display
- Update benchmark suite to assert against task outcomes, not pillar numbers

**Total: ~4 working days.**

---

## What Gets Deleted

- Snapshot 60-cap block (scanner_v3.js:1637–1647)
- Derived compliance `uai × 0.65` (scanner_v3.js:1645, uai-scoring.js recalculateCompliance)
- DEFAULT_ELEMENT_COUNTS fallback (uai-scoring.js) — no longer referenced
- COMPRESSION_EXPONENT curve — no longer a pillar formula

## What Stays

- Playwright navigation + stealth (navigateStealth)
- Page crash recovery (`recreatePage`, isPageAlive)
- Context isolation (desktop + mobile contexts)
- Axe-core integration — as evidence, not as primary score
- Benchmark harness — assertions updated to task-level

---

## Open Questions

1. **Do we keep pillar display in the UI?** My take: no. Replace with journey tasks. Pillars were always a rule-level abstraction; tasks are user-level. More honest.
2. **Full-audit tier — 20 pages at same weight?** Or scale weight down past page 5? Later decision; ship snapshot first.
3. **Benchmark suite coverage** — we have fixtures for financial/medical/ecommerce. Need fixture for task-level failures (e.g., a form with broken error handling). Add as part of Phase 1.

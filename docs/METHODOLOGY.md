# UAI Scoring Methodology — Version 4 (Journey Engine)

**UAI v4 measures accessibility as task completion — not rule counts.**

We simulate real user journeys across three role-typed pages and ask: can a keyboard or screen reader user actually complete the thing this page exists for?

> Score = weighted completion rate across 8 Playwright simulations. No compression curves. No snapshot caps. No arithmetic derived from other scores. Every number traces back to a specific pass, partial, or fail result on a specific test on a specific page.

---

## Version History

**UAI v4 (Journey Engine)** — April 2026 *(current)*
- Replaced pillar-based scoring with 8 task-based journey simulations
- Real keyboard traversal (T1): Tab up to 200 times, live trap detection
- Real form error simulation (T3): submit empty, check aria-invalid + live region
- Primary action simulation (T4): Tab to CTA, Enter, observe response
- Removed snapshot 60 cap — scores now reflect real task performance
- Compliance = real WCAG SC pass-rate across 14 tested criteria (not UAI × 0.65)
- Weakest-link floor: critical path failure caps at 60

**UAI v1.2 (Authority Engine)** — April 10, 2026
- 8-pillar weighted scoring with 1.8 compression exponent
- Snapshot hard cap at 60 + derived compliance
- Zero tolerance ceilings on critical violation counts

**Beta Snapshot Engine** — March 2026
- Initial six-pillar weighted scoring
- axe-core integration with Uhallo Vision AI

---

## The Process

Every scan is a real Playwright Chromium browser session — headless, with bot-detection bypassed, asset blocking enabled to reduce memory. We do not require site access or inject any widget.

**01 — Link Discovery**
Navigate to the target URL, extract all internal links from the DOM (nav, header, footer). Fallback to sitemap.xml if the page is bot-protected. This gives us the full link graph to select role-typed pages from.

**02 — Page Role Detection**
Three pages are selected: Home (the URL provided), Conversion (login/product/pricing — detected by URL pattern and vertical), and Form (contact/signup/checkout — detected by path keywords and anchor text).

**03 — Task Simulation**
For each page, run the applicable task simulations. Parallel-safe tasks run concurrently; state-modifying tasks (keyboard traversal, form submission, CTA activation) run sequentially to prevent race conditions.

**04 — Evidence Collection**
axe-core runs on the homepage to collect violation evidence for the audit report. This does not affect the score — scoring comes from task results only.

**05 — Journey Scoring**
Per-page scores computed from task completion rates. Final UAI = page-weighted composite: Conversion (40%), Home (30%), Form (30%). Weakest-link floor applied if a critical-path task fully fails.

> **Scope Limitations:** Automated task simulation reliably covers ~65% of WCAG 2.1 AA success criteria. The remaining ~35% — cognitive accessibility, complex custom widget interaction, third-party overlays, and manual screen-reader testing — require human review. UAI scanning is a rigorous floor, not a ceiling.

---

## The 8 Task Simulations

### T0 — Page Foundation (10 points, all pages)

**WCAG:** 3.1.1, 1.3.1, 2.4.2

**What it tests:** Valid lang attribute, single H1, at least 2 landmark regions, non-empty page title.

**Why it matters:** These are the four things a screen reader checks first. Without them, the user cannot determine what language the page is in, where to find the main content, or what the document is about.

**How it runs:** Playwright evaluates `document.documentElement.lang`, queries all landmark elements, counts H1 tags, reads `document.title`. Pass if zero failures. Partial if one. Fail if two or more.

**Pass condition:** lang valid, exactly 1 H1, ≥2 landmarks, descriptive title

---

### T1 — Keyboard Traversal (20 points, all pages)

**WCAG:** 2.1.1, 2.1.2, 2.4.3

**What it tests:** Presses Tab up to 200 times from a fresh page load. Records every focus target. Detects traps — where focus returns to the same element twice without progression.

**Why it matters:** If a keyboard user gets trapped in a carousel, modal, or sticky nav, they cannot reach the rest of the page. This is the highest-impact test in the suite. 5 of 5 US ecommerce sites we audited in April 2026 failed this check.

**How it runs:** `page.evaluate()` reads `document.activeElement` at every Tab press. outerKey fingerprint (tag + id + class + href) tracks element identity. If the same key appears twice in 4 consecutive steps, a trap is declared.

**Pass condition:** No trap detected across full Tab traversal, focus never lost to document.body

---

### T2 — Skip Link Functional (10 points, home + conversion)

**WCAG:** 2.4.1

**What it tests:** Presses Tab once from page load, checks for a skip-to-main link in the first two Tab stops. Then activates it with Enter and verifies focus moved inside `<main>` or `[role='main']`.

**Why it matters:** Without a working skip link, every keyboard user must Tab through the entire navigation on every single page visit. Not just present — it must actually work.

**How it runs:** Focus target text matched against `/skip|jump|bypass/i`. Link activated with Enter. `document.activeElement` checked: must be contained within main landmark. Partial if link exists but focus lands elsewhere.

**Pass condition:** Skip link in first 2 Tab stops AND focus moves inside main after activation

---

### T3 — Form Error Handling (15 points, form page)

**WCAG:** 3.3.1, 3.3.3, 4.1.3

**What it tests:** Submits the form with all required fields empty. Checks three things: (1) `aria-invalid="true"` on invalid fields, (2) `aria-describedby` pointing at error text, (3) an `aria-live` or `role="alert"` announcement.

**Why it matters:** If error messages are only visual, a screen reader user submits a form and hears nothing. They don't know it failed, can't find the errors, can't fix them. This blocks account creation, checkout, and contact flows entirely.

**How it runs:** MutationObserver is installed before submission to capture live region announcements. After 2 seconds, DOM is checked for aria-invalid + aria-describedby wiring. All three required for pass.

**Pass condition:** aria-invalid on invalid fields AND aria-describedby pointing at error text AND live region announcement

---

### T4 — Primary Action Keyboard (15 points, conversion page)

**WCAG:** 2.1.1

**What it tests:** Finds the primary CTA (Add to Cart, Sign Up, Log In, Get Started, Book). Tabs to it. Presses Enter. Checks for page navigation, modal opening, or DOM change within 1.5 seconds.

**Why it matters:** Many sites wire their primary button with onclick only. Works for mouse. Does nothing on keyboard Enter. The conversion point of the site is unreachable without a mouse.

**How it runs:** CTA matched against keyword regex against button text and data-testid. Tab traversal (up to 50 presses) to reach it. DOM state before/after Enter compared: URL change, modal count, innerHTML length delta.

**Pass condition:** Primary CTA reachable by Tab AND Enter produces navigation, modal, or measurable DOM change

---

### T5 — Accessible Names (10 points, all pages)

**WCAG:** 4.1.2

**What it tests:** Walks all interactive elements (buttons, links, inputs, selects, custom roles). Computes accessible name using the accname algorithm: aria-label → aria-labelledby → title → alt → innerText → label association.

**Why it matters:** A screen reader announces role and name. "Button" tells a user there is a button. Without a name, that's all they hear — forever. We found 39% unlabeled interactive elements on one major ecommerce site.

**How it runs:** `page.evaluate()` queries all interactive selectors, deduplicates by reference, checks each for accessible name via full accname priority chain including associated `<label>` elements. Fail if >20% unlabeled.

**Pass condition:** <5% of visible interactive elements have no computed accessible name

---

### T6 — Image Alt Quality (10 points, home + conversion)

**WCAG:** 1.1.1

**What it tests:** Evaluates alt text quality — not just presence. Rejects: generic words (image, photo, icon, banner), filenames (hero.jpg), URLs, and duplicate alt text used on 3+ images.

**Why it matters:** An alt of "image" tells a blind user exactly nothing. It's a failed alt disguised as a passing one. Most audit tools count the attribute — we read what it says.

**How it runs:** Meaningful images filtered (>10×10px, visible). Alt text tested against genericPattern and filenamePattern regex. Alt frequency map built — duplicates flagged. Fail if >30% bad, partial if 10–30%.

**Pass condition:** <10% of meaningful images have generic, filename, or duplicate alt text

---

### T7 — Reflow + Touch Targets (10 points, home + conversion)

**WCAG:** 1.4.10, 2.5.5

**What it tests:** Two checks. (1) Viewport resized to 640px — no horizontal scroll allowed. (2) Emulated iPhone 14 (390×844) — all visible interactive elements must be ≥44×44 CSS pixels.

**Why it matters:** Low-vision users zoom to 200–400%. If the layout breaks, they lose access to content. Mobile users with motor impairments need tap targets large enough to hit reliably. One site had 85% of interactive elements under 44px.

**How it runs:** `page.setViewportSize({ width: 640, height: 800 })` then `document.documentElement.scrollWidth > window.innerWidth`. Then 390×844 emulation, `getBoundingClientRect()` on all visible interactive elements.

**Pass condition:** No horizontal scroll at 640px AND <10% of touch targets under 44×44px

---

## Three Role-Typed Pages

We don't scan 3 random pages and average them. Each page has a role, and only the tests that make sense for that role are applied. Missing roles redistribute their weight to the pages that were found.

| Page | Weight | Purpose | Tasks |
|------|--------|---------|-------|
| Home | 30% | Arrival + Orientation | T0, T1, T2, T5, T6, T7 |
| Conversion | 40% | Primary Task Completion | T0, T1, T2, T4, T5, T6, T7 |
| Form | 30% | Interaction + Error Recovery | T0, T1, T3, T5 |

---

## Score Formula

### Step 1 — Per-task status value
```
pass    → 1.0  (full points)
partial → 0.5  (half points)
fail    → 0.0  (no points)
n/a     → excluded from denominator
```

### Step 2 — Per-page score
```
page_score = Σ(task.weight × status_value) / Σ(applicable_task.weight) × 100
```

### Step 3 — Journey score (UAI)
```
UAI = (home × 0.30) + (conversion × 0.40) + (form × 0.30)
        / Σ(effective_weights)
```

### Step 4 — Weakest-link floor
If a critical-path task (T1 keyboard traversal, T3 form errors, T4 primary action) fully fails on any page, the UAI is capped at 60. Catastrophic usability failures cannot be averaged away.

```
if (T1 === fail OR T3 === fail OR T4 === fail):
  UAI = min(60, UAI)
```

---

## Compliance Score

The compliance percentage is a real WCAG 2.1 Success Criteria pass rate — not a number derived from the UAI.

**14 Tested Success Criteria:** 1.1.1, 1.3.1, 1.4.10, 2.1.1, 2.1.2, 2.4.1, 2.4.2, 2.4.3, 2.5.5, 3.1.1, 3.3.1, 3.3.3, 4.1.2, 4.1.3

```
compliance = passed_SC_count / total_tested_SC_count × 100
```

A SC is "passed" only if it passed on every page where it was tested. Not per-page averaging.

> **Why this matters:** Previous versions derived compliance as `UAI × 0.65`. That is arithmetic, not measurement. The v4 compliance score is a distinct number with its own source of truth. A site can have a UAI of 55 and 30% compliance or 55% compliance depending on which specific SCs it passed.

---

## Regulation Mapping

| Regulation | Scope | Standard | Deadline |
|-----------|-------|---------|---------|
| WCAG 2.1 / 2.2 AA | International benchmark | ISO/IEC 40500 | Baseline |
| EAA Directive 2019/882 | Products & services sold in EU | EN 301 549 | June 28, 2025 |
| ADA Title III / §508 | US state, local gov & public websites | WCAG 2.1 AA | Immediate |
| SEBI / GIGW 3.0 | Indian financial entities & .gov.in | WCAG 2.1 AA | July 31, 2026 |
| RPwD Act 2016 | All digital services in India | Accessible India | Immediate |

---

## Trust Architecture

**Real browser, real interaction:** Every task runs inside a live Playwright Chromium session. Tab key presses are real keyboard events. Form submissions are real clicks. Not static HTML parsing — actual simulation.

**axe-core for violation evidence:** axe-core is open source, maintained by Deque Systems, cited in DOJ guidance, used by Microsoft, Google, and IBM. It provides supplementary violation evidence attached to audit reports.

**HMAC-Signed Results:** Every scan is stored with a SHA-256 hash and HMAC signature on the Uhallo platform. The number you see is the number that was computed.

**Open Methodology:** This document is the complete specification. Every task, its pass condition, its scoring weight, and its WCAG mapping is documented here in full. Version-tagged. No black boxes.

**Evidence, Not Just Numbers:** A score of 36 comes with: the specific keyboard trap element, the exact form fields missing aria-invalid, the touch targets that failed, and the WCAG SCs each maps to.

**Dispute Process:** If you believe a score is incorrect, contact us at uhallo.com. We will re-run the scan, publish the new result, and if the error was ours, document the correction in version history.

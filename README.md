# Uhallo Accessibility Index (UAI)

**Open methodology for task-based web accessibility measurement.**

[![npm version](https://badge.fury.io/js/@uhallo%2Faccessibility-index.svg)](https://badge.fury.io/js/@uhallo%2Faccessibility-index)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/uhallolabs/uhallo-accessibility-index.svg?style=social&label=Star)](https://github.com/uhallolabs/uhallo-accessibility-index)
[![WCAG](https://img.shields.io/badge/standard-WCAG%202.1%20AA-green.svg)](https://www.w3.org/WAI/WCAG21/quickref/)
[![Regulations](https://img.shields.io/badge/mapped%20to-SEBI%20%7C%20EAA%20%7C%20ADA-orange.svg)](docs/METHODOLOGY.md)

## 🚀 Quick Start (CLI)

You can run the UAI across any public URL instantly using `npx`:

```bash
npx @uhallo/accessibility-index https://example.com
```

This will launch a headless Chromium browser, simulate the 8 accessibility tasks, and print a color-coded structural breakdown directly to your terminal.

```text
Task Breakdown:
────────────────────────────────────────────────────────────
[PASS] Page Foundation (T0)
[FAIL] Image Alt Quality (T6)
       ╰─ 3 images missing descriptions
       SCs: 1.1.1
```

---

## 💻 Programmatic Usage

You can import the core Engine directly into your Node.js testing suites (Jest, Vitest, Playwright Test).

```bash
npm install @uhallo/accessibility-index playwright @axe-core/playwright
```

```javascript
import { scan } from '@uhallo/accessibility-index';

// Pass your own configured Playwright page (e.g. for authenticated sessions)
const { score } = await scan('https://example.com/dashboard', 'conversion', playwrightPage);

console.log(`UAI Score: ${score.uai_score}/100`);
if (score.uai_score < 80) {
  throw new Error('Accessibility degraded below compliance threshold!');
}
```

---

## What Is This

Most accessibility scanners just count HTML violations and spit out a score. The UAI does something else: it spins up a real browser and tries to complete human tasks.

Instead of asking "Are there ARIA errors?", it asks "Can a keyboard user actually check out?"

This repository contains the complete scoring algorithm and the 8 task simulations we use in production.

---

## How It Works

A UAI audit simulates 8 tasks across 3 types of pages. We weight the score based on how critical the page is to the user's journey.

| Page Type | Weight | Purpose |
|-----------|--------|---------|
| Home | 30% | Arrival — can a screen reader user find the main content without getting lost? |
| Conversion | 40% | Primary task — can a keyboard user actually reach and activate the core action? |
| Form | 30% | Interaction — if a user makes a mistake, does assistive tech tell them how to fix it? |

Each page runs the applicable tasks from the suite below. The final UAI is a weighted completion rate.

---

## The 8 Task Simulations

| Task | Points | Pages | WCAG SCs |
|------|--------|-------|----------|
| **T0** Page Foundation | 10 | All | 3.1.1, 1.3.1, 2.4.2 |
| **T1** Keyboard Traversal | 20 | All | 2.1.1, 2.1.2, 2.4.3 |
| **T2** Skip Link Functional | 10 | Home, Conversion | 2.4.1 |
| **T3** Form Error Handling | 15 | Form | 3.3.1, 3.3.3, 4.1.3 |
| **T4** Primary Action Keyboard | 15 | Conversion | 2.1.1 |
| **T5** Accessible Names | 10 | All | 4.1.2 |
| **T6** Image Alt Quality | 10 | Home, Conversion | 1.1.1 |
| **T7** Reflow + Touch Targets | 10 | Home, Conversion | 1.4.10, 2.5.5 |

---

## Score Formula

```
# Per-task status value
pass    → 1.0  (full points)
partial → 0.5  (half points)
fail    → 0.0  (no points)
n/a     → excluded from denominator

# Per-page score
page_score = Σ(task.weight × status_value) / Σ(applicable_task.weight) × 100

# Journey score (UAI)
UAI = (home × 0.30) + (conversion × 0.40) + (form × 0.30)

# Weakest-link floor
if (T1 === fail OR T3 === fail OR T4 === fail):
  UAI = min(60, UAI)
```

**Compliance** is a real WCAG 2.1 Success Criteria pass rate — not derived from the UAI score. A SC is "passed" only if it passed on every page it was tested on.

---

## Score Bands

| Range | Status |
|-------|--------|
| 80–100 | Compliant |
| 60–79 | At Risk |
| 40–59 | Non-Compliant |
| 0–39 | Critical Failure |

---

## Regulation Mapping

Each task maps to WCAG 2.1 AA Success Criteria that are legally required under:

- **SEBI / GIGW 3.0** — Indian financial entities + .gov.in domains (deadline: July 31, 2026)
- **EAA Directive 2019/882** — Products and services sold in EU (enforcement: June 28, 2025)
- **ADA Title III** — US public-facing digital services (immediate legal obligation)
- **RPwD Act 2016** — All digital services in India

---

## Repository Structure

```
@uhallo/accessibility-index/
├── src/
│   ├── task-runner.js        # Orchestrator: runs tasks for a page, computes page score
│   ├── scoring.js            # computeJourneyScore() — final UAI and compliance
│   └── tasks/
│       ├── t0-orientation.js      # Page foundation checks
│       ├── t1-keyboard-traversal.js # Tab 200 times, detect traps
│       ├── t2-skip-link.js        # Skip link presence + activation
│       ├── t3-form-error-handling.js # Submit empty, check aria-invalid
│       ├── t4-primary-action.js   # Tab to CTA, Enter, observe DOM
│       ├── t5-accessibility-tree.js  # Accessible names audit
│       ├── t6-image-alt-quality.js  # Alt text quality (not just presence)
│       └── t7-reflow-touch.js    # 640px reflow + 44px touch targets
├── docs/
│   ├── METHODOLOGY.md        # Full specification with pass conditions
│   └── ARCHITECTURE.md       # Design rationale and version history
├── LICENSE                   # Apache 2.0
└── README.md
```

---

## Usage

The task files are designed to run inside a [Playwright](https://playwright.dev/) browser session. Each task exports a `run(page)` function:

```javascript
import { run as runT1 } from './src/tasks/t1-keyboard-traversal.js';
import { runTasksForPage } from './src/task-runner.js';
import { computeJourneyScore } from './src/scoring.js';

// Run all tasks for a page
const pageResult = await runTasksForPage(page, 'conversion', url);

// Compute final score across pages
const score = computeJourneyScore([homeResult, conversionResult, formResult]);

console.log(score.uai_score);           // e.g. 47
console.log(score.estimated_compliance); // e.g. 36 (% of 14 WCAG SCs passed)
```

Each task returns:
```javascript
{
  status: 'pass' | 'partial' | 'fail' | 'n/a',
  points: 1.0 | 0.5 | 0.0,
  wcag_sc: ['2.1.1', '2.1.2'],
  reason: 'Keyboard trap detected at .sticky-nav after 12 Tab presses',
  evidence: { element: '...', selector: '...' }
}
```

---

## About This Repository

This isn't a stripped-down open-source version. This is the exact code that powers production audits on [uhallo.com](https://uhallo.com).

We pulled the scoring methodology and task simulations out of our main repo so anyone can inspect, verify, and debate the standard—completely separate from our commercial platform.

**If you see a UAI score on an Uhallo report, this is the code that calculated it.**

This project was built by [Axn Sadokpam](https://github.com/axnsadokpam), a blind founder. He used Claude to help write the implementation—proving that LLMs can actually help disabled developers build serious infrastructure.

---

## Contributing

Issues and PRs are welcome. The methodology is intentionally versioned (we're currently on the v1 Journey Engine). If you think a task definition, pass condition, or weight is wrong, open an issue and tell us why. Breaking changes require a version bump and updated docs.

---

## See It Live

- **Methodology docs:** [uhallo.com/uai](https://uhallo.com/uai)
- **Live rankings:** [uhallo.com/governance](https://uhallo.com/governance)
- **Run a free scan:** [uhallo.com](https://uhallo.com)

---

## License

MIT — see [LICENSE](LICENSE)

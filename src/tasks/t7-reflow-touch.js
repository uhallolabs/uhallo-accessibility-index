/**
 * T7 — Reflow + Touch Targets (10pt)
 * WCAG 2.1: 1.4.10 Reflow, 2.5.5 Target Size
 *
 * Two checks:
 * 1. At 640px width — no horizontal scroll (reflow)
 * 2. At 390×844 (iPhone 14) — all interactive elements ≥44×44 CSS px
 */
export async function run(page) {
    const wcag_sc = ['1.4.10', '2.5.5'];
    try {
        // ── Reflow check at 640px wide ──
        const originalViewport = page.viewportSize() || { width: 1280, height: 800 };
        await page.setViewportSize({ width: 640, height: 800 });
        await page.waitForTimeout(500);

        const reflowFail = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth + 2; // +2px tolerance
        });

        // ── Touch target check at 390×844 ──
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);

        const touchResults = await page.evaluate(() => {
            const interactives = Array.from(document.querySelectorAll(
                'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])'
            ));

            const visible = interactives.filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
            });

            const tooSmall = visible.filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width < 44 || rect.height < 44;
            });

            const examples = tooSmall.slice(0, 8).map(el => ({
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().slice(0, 40),
                width: Math.round(el.getBoundingClientRect().width),
                height: Math.round(el.getBoundingClientRect().height)
            }));

            return {
                total: visible.length,
                too_small: tooSmall.length,
                examples
            };
        });

        // Restore original viewport
        await page.setViewportSize(originalViewport);

        const touchFailRate = touchResults.total > 0 ? touchResults.too_small / touchResults.total : 0;

        // Scoring: each sub-check contributes 50% of the task weight
        if (!reflowFail && touchFailRate <= 0.10) {
            return {
                status: 'pass',
                wcag_sc,
                points: 1.0,
                reason: `Reflow OK at 640px. Touch targets: ${touchResults.too_small}/${touchResults.total} under 44×44 (${Math.round(touchFailRate * 100)}%)`,
                evidence: { reflow_fail: false, touch: touchResults }
            };
        }

        if (reflowFail && touchFailRate > 0.10) {
            return {
                status: 'fail',
                wcag_sc,
                points: 0,
                reason: `Horizontal scroll at 640px width AND ${Math.round(touchFailRate * 100)}% of touch targets under 44×44px`,
                evidence: { reflow_fail: true, touch: touchResults }
            };
        }

        return {
            status: 'partial',
            wcag_sc,
            points: 0.5,
            reason: `${reflowFail ? 'Horizontal scroll at 640px' : 'Reflow OK'}. Touch targets: ${touchResults.too_small}/${touchResults.total} under 44×44 (${Math.round(touchFailRate * 100)}%)`,
            evidence: { reflow_fail: reflowFail, touch: touchResults }
        };
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Reflow/touch check threw: ${err.message}`,
            evidence: {}
        };
    }
}

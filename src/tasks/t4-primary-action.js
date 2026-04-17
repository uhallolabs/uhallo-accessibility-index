/**
 * T4 — Primary Action Keyboard-Activatable (15pt)
 * WCAG 2.1: 2.1.1 Keyboard
 *
 * Find the primary CTA button. Tab to it. Press Enter.
 * Verify the page responds (navigation, modal open, DOM change).
 * Catches JS-only onclick handlers that ignore keyboard events.
 */
export async function run(page) {
    const wcag_sc = ['2.1.1'];
    try {
        // Snapshot DOM before activation
        const beforeState = await page.evaluate(() => ({
            url: location.href,
            bodyHash: document.body.innerHTML.length,
            modalCount: document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length
        }));

        // Find primary CTA — ordered by specificity
        const ctaSelector = [
            'button[data-testid*="cart"], button[data-testid*="buy"], button[data-testid*="checkout"]',
            'button[class*="add-to-cart"], button[class*="buy"], button[class*="cta"]',
            'a[href*="signup"], a[href*="register"], a[href*="get-started"]',
            'button'
        ].join(', ');

        const ctaFound = await page.evaluate((sel) => {
            const candidates = Array.from(document.querySelectorAll(sel));
            const ctaKeywords = /add to cart|buy now|shop now|sign up|get started|start free|try free|login|log in|subscribe|checkout|book|contact|request|get quote/i;
            const primary = candidates.find(el => {
                const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
                return ctaKeywords.test(text) && el.offsetParent !== null; // visible
            }) || candidates.find(el => {
                // Fallback: biggest visible button in top half of page
                const rect = el.getBoundingClientRect();
                return rect.top < window.innerHeight * 0.7 && el.offsetParent !== null;
            });

            if (!primary) return null;
            return {
                tag: primary.tagName.toLowerCase(),
                text: (primary.textContent || primary.getAttribute('aria-label') || '').trim().slice(0, 80),
                tabIndex: primary.tabIndex,
                type: primary.getAttribute('type') || null
            };
        }, ctaSelector);

        if (!ctaFound) {
            return {
                status: 'n/a',
                wcag_sc,
                points: null,
                reason: 'No primary CTA button identified on this page',
                evidence: {}
            };
        }

        // Tab to the element — up to 50 tabs
        let reached = false;
        await page.evaluate(() => document.body.focus());

        for (let i = 0; i < 50; i++) {
            await page.keyboard.press('Tab');
            const active = await page.evaluate((targetText) => {
                const el = document.activeElement;
                if (!el) return false;
                const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
                return text.toLowerCase().includes(targetText.toLowerCase().slice(0, 20));
            }, ctaFound.text);
            if (active) { reached = true; break; }
        }

        if (!reached) {
            return {
                status: 'fail',
                wcag_sc,
                points: 0,
                reason: `Primary CTA "${ctaFound.text}" is not reachable by keyboard in 50 Tab presses`,
                evidence: { cta: ctaFound }
            };
        }

        // Activate with Enter and observe response
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);

        const afterState = await page.evaluate(() => ({
            url: location.href,
            bodyHash: document.body.innerHTML.length,
            modalCount: document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length
        }));

        const navigated = afterState.url !== beforeState.url;
        const modalOpened = afterState.modalCount > beforeState.modalCount;
        const domChanged = Math.abs(afterState.bodyHash - beforeState.bodyHash) > 200;

        if (navigated || modalOpened || domChanged) {
            return {
                status: 'pass',
                wcag_sc,
                points: 1.0,
                reason: `Primary CTA "${ctaFound.text}" keyboard-activatable — ${navigated ? 'navigated' : modalOpened ? 'modal opened' : 'DOM updated'}`,
                evidence: { cta: ctaFound, navigated, modalOpened, domChanged }
            };
        }

        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Primary CTA "${ctaFound.text}" reached by keyboard but Enter produced no response — likely JS-only onclick handler`,
            evidence: { cta: ctaFound, before: beforeState, after: afterState }
        };
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Primary action check threw: ${err.message}`,
            evidence: {}
        };
    }
}

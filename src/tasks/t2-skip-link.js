/**
 * T2 — Skip Link Functional (10pt)
 * WCAG 2.1: 2.4.1 Bypass Blocks
 *
 * First Tab from fresh load should reveal a skip link. Activating it must
 * move focus into <main> or [role="main"], not just visually scroll.
 */
export async function run(page) {
    const wcag_sc = ['2.4.1'];
    try {
        await page.evaluate(() => document.body.focus());
        await page.keyboard.press('Tab');

        const skipLink = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const text = (el.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase();
            const isSkip = /skip|jump|bypass|go to (main|content)/i.test(text);
            return isSkip ? {
                text: el.textContent.trim().slice(0, 80),
                href: el.getAttribute('href') || null,
                tag: el.tagName.toLowerCase()
            } : null;
        });

        if (!skipLink) {
            // Try one more Tab in case skip link is second
            await page.keyboard.press('Tab');
            const secondTry = await page.evaluate(() => {
                const el = document.activeElement;
                if (!el || el === document.body) return null;
                const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
                return /skip|jump|bypass/i.test(text) ? { text: text.slice(0, 80) } : null;
            });

            if (!secondTry) {
                return {
                    status: 'fail',
                    wcag_sc,
                    points: 0,
                    reason: 'No skip link found in first two Tab stops — screen reader users must Tab through all navigation on every page',
                    evidence: {}
                };
            }
        }

        // Activate the skip link
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        const focusInMain = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return false;
            const main = document.querySelector('main, [role="main"], #main, #content, #maincontent');
            return main ? main.contains(el) || el === main : false;
        });

        if (!focusInMain) {
            return {
                status: 'partial',
                wcag_sc,
                points: 0.5,
                reason: 'Skip link exists but focus did not land inside <main> after activation — link may be broken or target anchor missing',
                evidence: { skip_link: skipLink }
            };
        }

        return {
            status: 'pass',
            wcag_sc,
            points: 1.0,
            reason: 'Skip link present and functional — focus correctly moved into main content region',
            evidence: { skip_link: skipLink }
        };
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Skip link check threw: ${err.message}`,
            evidence: {}
        };
    }
}

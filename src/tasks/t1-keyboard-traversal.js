/**
 * T1 — Keyboard Traversal (20pt)
 * WCAG 2.1: 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order
 *
 * Tab through the page up to 200 times. Detect focus traps and focus loss.
 * A trap is when focus returns to the same element twice without progressing.
 */
export async function run(page) {
    const wcag_sc = ['2.1.1', '2.1.2', '2.4.3'];
    try {
        // Fresh focus state — click top of page body without triggering links
        await page.evaluate(() => document.body.focus());

        const visited = [];
        let trapElement = null;
        let focusLostCount = 0;
        const MAX_TABS = 200;

        for (let i = 0; i < MAX_TABS; i++) {
            await page.keyboard.press('Tab');

            const current = await page.evaluate(() => {
                const el = document.activeElement;
                if (!el || el === document.body) return null;
                return {
                    tag: el.tagName.toLowerCase(),
                    role: el.getAttribute('role') || null,
                    id: el.id || null,
                    text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 60),
                    outerKey: `${el.tagName}|${el.id}|${el.className}|${el.getAttribute('href') || ''}`.slice(0, 120)
                };
            });

            if (!current) {
                focusLostCount++;
                if (focusLostCount >= 3) {
                    return {
                        status: 'fail',
                        wcag_sc,
                        points: 0,
                        reason: 'Focus repeatedly lost to document body — keyboard users cannot navigate the page',
                        evidence: { visited_count: visited.length, last_visited: visited.slice(-3) }
                    };
                }
                continue;
            }

            // Trap detection: same outerKey appeared in last 4 steps
            const recentKeys = visited.slice(-4).map(v => v.outerKey);
            if (recentKeys.filter(k => k === current.outerKey).length >= 2) {
                trapElement = current;
                break;
            }

            visited.push(current);

            // Natural end: reached a known terminal element (footer link, last button)
            if (visited.length >= MAX_TABS) break;
        }

        if (trapElement) {
            return {
                status: 'fail',
                wcag_sc,
                points: 0,
                reason: `Keyboard trap detected at <${trapElement.tag}${trapElement.role ? ` role="${trapElement.role}"` : ''}> "${trapElement.text}"`,
                evidence: { trap_element: trapElement, visited_count: visited.length }
            };
        }

        if (focusLostCount > 0) {
            return {
                status: 'partial',
                wcag_sc,
                points: 0.5,
                reason: `Focus was lost ${focusLostCount} time(s) during traversal — keyboard users may get disoriented`,
                evidence: { visited_count: visited.length, focus_lost_count: focusLostCount }
            };
        }

        return {
            status: 'pass',
            wcag_sc,
            points: 1.0,
            reason: `Keyboard traversal completed cleanly — ${visited.length} focusable elements, no traps detected`,
            evidence: { visited_count: visited.length }
        };
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Keyboard traversal threw: ${err.message}`,
            evidence: {}
        };
    }
}

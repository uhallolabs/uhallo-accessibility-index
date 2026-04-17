/**
 * T5 — Accessibility Tree Coherence (10pt)
 * WCAG 2.1: 4.1.2 Name, Role, Value
 *
 * Walk interactive elements in the DOM and check what assistive technology
 * would actually see. page.accessibility.snapshot() was removed in Playwright
 * 1.46 — this uses evaluate() + ARIA attribute inspection instead.
 *
 * Checks: interactive elements with no accessible name (aria-label,
 * aria-labelledby, title, or inner text).
 */
export async function run(page) {
    const wcag_sc = ['4.1.2'];
    try {
        const results = await page.evaluate(() => {
            const interactiveSelectors = [
                'a[href]', 'button', 'input:not([type="hidden"])',
                'select', 'textarea',
                '[role="button"]', '[role="link"]', '[role="textbox"]',
                '[role="combobox"]', '[role="checkbox"]', '[role="radio"]',
                '[role="menuitem"]', '[role="tab"]', '[role="option"]',
                '[role="slider"]', '[role="spinbutton"]', '[role="switch"]',
                '[role="searchbox"]', '[role="treeitem"]',
                '[tabindex]:not([tabindex="-1"])'
            ];

            const elements = Array.from(document.querySelectorAll(interactiveSelectors.join(',')));

            // Deduplicate (a tabindex element might also be a button)
            const unique = [...new Set(elements)].filter(el => el.offsetParent !== null);

            let total = 0;
            let unlabeled = 0;
            const unlabeledExamples = [];

            for (const el of unique) {
                total++;

                // Compute accessible name (simplified version of accname algorithm)
                const ariaLabel = el.getAttribute('aria-label')?.trim();
                const ariaLabelledBy = el.getAttribute('aria-labelledby');
                const title = el.getAttribute('title')?.trim();
                const alt = el.getAttribute('alt')?.trim();
                const placeholder = el.getAttribute('placeholder')?.trim();
                const innerText = el.textContent?.trim();
                const value = el.getAttribute('value')?.trim();

                let hasName = false;

                if (ariaLabel && ariaLabel.length > 0) hasName = true;
                else if (ariaLabelledBy) {
                    const labelEl = document.getElementById(ariaLabelledBy.split(' ')[0]);
                    if (labelEl?.textContent?.trim()) hasName = true;
                }
                else if (title && title.length > 0) hasName = true;
                else if (alt && alt.length > 0) hasName = true;
                else if (innerText && innerText.length > 0 && innerText.length < 200) hasName = true;
                else if (placeholder && placeholder.length > 0) hasName = true;
                else if (value && value.length > 0) hasName = true;
                // Check associated <label>
                else if (el.id) {
                    const label = document.querySelector(`label[for="${el.id}"]`);
                    if (label?.textContent?.trim()) hasName = true;
                }
                // Check wrapping label
                else {
                    const parentLabel = el.closest('label');
                    if (parentLabel?.textContent?.trim()) hasName = true;
                }

                if (!hasName) {
                    unlabeled++;
                    if (unlabeledExamples.length < 10) {
                        unlabeledExamples.push({
                            tag: el.tagName.toLowerCase(),
                            role: el.getAttribute('role') || null,
                            type: el.getAttribute('type') || null,
                            outerHTML: el.outerHTML.slice(0, 120)
                        });
                    }
                }
            }

            return { total, unlabeled, unlabeled_examples: unlabeledExamples };
        });

        if (results.total === 0) {
            return {
                status: 'partial',
                wcag_sc,
                points: 0.5,
                reason: 'No interactive elements found in DOM — page structure may not expose controls to assistive technology',
                evidence: { total_interactive: 0 }
            };
        }

        const unlabeledPct = results.unlabeled / results.total;

        if (unlabeledPct > 0.20) {
            return {
                status: 'fail',
                wcag_sc,
                points: 0,
                reason: `${Math.round(unlabeledPct * 100)}% of interactive elements have no accessible name (${results.unlabeled}/${results.total}) — screen readers announce these as role only`,
                evidence: results
            };
        }

        if (unlabeledPct > 0.05) {
            return {
                status: 'partial',
                wcag_sc,
                points: 0.5,
                reason: `${Math.round(unlabeledPct * 100)}% of interactive elements have no accessible name (${results.unlabeled}/${results.total})`,
                evidence: results
            };
        }

        return {
            status: 'pass',
            wcag_sc,
            points: 1.0,
            reason: `Interactive elements well-labeled — ${results.total} checked, ${results.unlabeled} unlabeled (${Math.round(unlabeledPct * 100)}%)`,
            evidence: results
        };
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Accessibility tree check threw: ${err.message}`,
            evidence: {}
        };
    }
}

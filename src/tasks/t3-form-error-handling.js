/**
 * T3 — Form Error Handling (15pt)
 * WCAG 2.1: 3.3.1 Error Identification, 3.3.3 Error Suggestion, 4.1.3 Status Messages
 *
 * Submit the form empty. Check that errors are:
 * (a) announced via aria-live/role="alert"
 * (b) each invalid field has aria-invalid="true"
 * (c) each invalid field has aria-describedby pointing at error text
 */
export async function run(page) {
    const wcag_sc = ['3.3.1', '3.3.3', '4.1.3'];
    try {
        // Find the primary form with required fields
        const formFound = await page.evaluate(() => {
            const forms = Array.from(document.querySelectorAll('form'));
            const target = forms.find(f => {
                const inputs = f.querySelectorAll('input[required], input[aria-required="true"], textarea[required], select[required]');
                return inputs.length > 0;
            }) || forms.find(f => {
                const inputs = f.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="reset"])');
                return inputs.length > 0;
            });
            return !!target;
        });

        if (!formFound) {
            return {
                status: 'n/a',
                wcag_sc,
                points: null,
                reason: 'No form with input fields found on this page',
                evidence: {}
            };
        }

        // Set up aria-live monitoring before submission
        await page.evaluate(() => {
            window.__uhallo_alerts = [];
            const obs = new MutationObserver(muts => {
                for (const m of muts) {
                    const el = m.target;
                    const role = el.getAttribute('role');
                    const live = el.getAttribute('aria-live');
                    if (role === 'alert' || role === 'status' || live === 'assertive' || live === 'polite') {
                        if (el.textContent.trim()) window.__uhallo_alerts.push(el.textContent.trim().slice(0, 120));
                    }
                    // Check added nodes
                    for (const n of m.addedNodes) {
                        if (n.nodeType === 1) {
                            const nr = n.getAttribute?.('role');
                            const nl = n.getAttribute?.('aria-live');
                            if (nr === 'alert' || nr === 'status' || nl === 'assertive' || nl === 'polite') {
                                if (n.textContent?.trim()) window.__uhallo_alerts.push(n.textContent.trim().slice(0, 120));
                            }
                        }
                    }
                }
            });
            obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-live', 'role', 'aria-invalid'] });
        });

        // Submit the form with empty fields
        await page.evaluate(() => {
            const submit = document.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
            if (submit) submit.click();
        });

        await page.waitForTimeout(2000);

        // Check results
        const results = await page.evaluate(() => {
            const invalids = Array.from(document.querySelectorAll('[aria-invalid="true"]'));
            const hasAriaInvalid = invalids.length > 0;

            const withDescribedBy = invalids.filter(el => {
                const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
                return ids.some(id => {
                    const target = document.getElementById(id);
                    return target && target.textContent.trim().length > 0;
                });
            });

            const alerts = window.__uhallo_alerts || [];
            const hasLiveAnnouncement = alerts.length > 0;

            // Also check for HTML5 native validity messages (partial credit)
            const nativeInvalid = Array.from(document.querySelectorAll(':invalid')).filter(el =>
                el.tagName !== 'FIELDSET' && el.tagName !== 'FORM'
            );

            return {
                aria_invalid_count: invalids.length,
                aria_described_count: withDescribedBy.length,
                live_announced: hasLiveAnnouncement,
                live_alerts: alerts.slice(0, 5),
                native_invalid_count: nativeInvalid.length,
                has_aria_invalid: hasAriaInvalid
            };
        });

        const allThree = results.has_aria_invalid && results.aria_described_count > 0 && results.live_announced;
        const someAccessible = results.has_aria_invalid || results.live_announced || results.native_invalid_count > 0;

        if (allThree) {
            return {
                status: 'pass',
                wcag_sc,
                points: 1.0,
                reason: `Form errors fully accessible: aria-invalid on ${results.aria_invalid_count} fields, ${results.aria_described_count} with aria-describedby, live region announced`,
                evidence: results
            };
        }

        if (someAccessible) {
            return {
                status: 'partial',
                wcag_sc,
                points: 0.5,
                reason: `Form errors partially accessible — missing: ${!results.has_aria_invalid ? 'aria-invalid ' : ''}${results.aria_described_count === 0 ? 'aria-describedby ' : ''}${!results.live_announced ? 'live announcement' : ''}`.trim(),
                evidence: results
            };
        }

        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: 'Form errors are not communicated to assistive technology — no aria-invalid, no aria-describedby, no live region announcement',
            evidence: results
        };
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Form error check threw: ${err.message}`,
            evidence: {}
        };
    }
}

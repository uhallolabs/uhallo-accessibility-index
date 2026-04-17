/**
 * T6 — Image Alt Quality (10pt)
 * WCAG 2.1: 1.1.1 Non-text Content
 *
 * Not just "does alt exist" — is it meaningful?
 * Reject: generic words (image, photo, icon), filenames, duplicates.
 */
export async function run(page) {
    const wcag_sc = ['1.1.1'];
    try {
        const results = await page.evaluate(() => {
            const genericPattern = /^(image|picture|photo|img|icon|logo|banner|graphic|thumbnail|avatar|placeholder|spacer|arrow|button|decorative|untitled)\s*\d*$/i;
            const filenamePattern = /\.(jpg|jpeg|png|gif|svg|webp|avif|bmp)(\?.*)?$/i;
            const urlPattern = /^https?:\/\//i;

            const images = Array.from(document.querySelectorAll('img'));
            // Filter out tracking pixels and tiny images
            const meaningful = images.filter(img => {
                const w = img.naturalWidth || img.width || img.offsetWidth;
                const h = img.naturalHeight || img.height || img.offsetHeight;
                return w > 10 && h > 10 && img.offsetParent !== null;
            });

            if (meaningful.length === 0) return { total: 0, missing: 0, bad: 0, bad_examples: [] };

            const altTexts = [];
            const badImages = [];
            let missingCount = 0;

            for (const img of meaningful) {
                const alt = img.getAttribute('alt');
                const role = img.getAttribute('role');

                // Decorative intent — skip
                if (alt === '' || role === 'presentation' || role === 'none') continue;

                if (alt === null) {
                    missingCount++;
                    badImages.push({ src: img.src.slice(-60), issue: 'missing alt' });
                    continue;
                }

                const altTrimmed = alt.trim();

                // Check for generic/filename/URL alt text
                if (
                    genericPattern.test(altTrimmed) ||
                    filenamePattern.test(altTrimmed) ||
                    urlPattern.test(altTrimmed) ||
                    altTrimmed.length === 0
                ) {
                    badImages.push({ src: img.src.slice(-60), alt: altTrimmed.slice(0, 60), issue: 'generic or filename' });
                } else {
                    altTexts.push(altTrimmed.toLowerCase());
                }
            }

            // Duplicate alt text check (same alt on 3+ images = likely templated/broken)
            const altFreq = {};
            altTexts.forEach(t => { altFreq[t] = (altFreq[t] || 0) + 1; });
            const duplicates = Object.entries(altFreq).filter(([, count]) => count >= 3);
            for (const [text] of duplicates) {
                if (!badImages.some(b => b.alt === text)) {
                    badImages.push({ alt: text.slice(0, 60), issue: `duplicate alt used ${altFreq[text]} times` });
                }
            }

            return {
                total: meaningful.length,
                missing: missingCount,
                bad: badImages.length,
                bad_examples: badImages.slice(0, 8)
            };
        });

        if (results.total === 0) {
            return {
                status: 'n/a',
                wcag_sc,
                points: null,
                reason: 'No meaningful images found on this page',
                evidence: {}
            };
        }

        const badRate = results.bad / results.total;

        if (badRate > 0.30) {
            return {
                status: 'fail',
                wcag_sc,
                points: 0,
                reason: `${Math.round(badRate * 100)}% of images have missing or meaningless alt text (${results.bad}/${results.total})`,
                evidence: results
            };
        }

        if (badRate > 0.10) {
            return {
                status: 'partial',
                wcag_sc,
                points: 0.5,
                reason: `${Math.round(badRate * 100)}% of images have poor alt text (${results.bad}/${results.total})`,
                evidence: results
            };
        }

        return {
            status: 'pass',
            wcag_sc,
            points: 1.0,
            reason: `Image alt quality good — ${results.total} images, ${results.bad} with issues (${Math.round(badRate * 100)}%)`,
            evidence: results
        };
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Image alt quality check threw: ${err.message}`,
            evidence: {}
        };
    }
}

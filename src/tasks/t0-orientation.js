/**
 * T0 — Orientation / Page Foundation (10pt)
 * WCAG 2.1: 3.1.1 Language of Page, 1.3.1 Info and Relationships, 2.4.2 Page Titled
 *
 * Fast checks that run on every page type.
 * Checks: lang attribute, single H1, at least one landmark, non-empty <title>.
 */
export async function run(page) {
    const wcag_sc = ['3.1.1', '1.3.1', '2.4.2'];
    try {
        const results = await page.evaluate(() => {
            // lang check
            const lang = document.documentElement.getAttribute('lang');
            const langValid = lang && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(lang.trim());

            // H1 check
            const h1s = document.querySelectorAll('h1');
            const h1Count = h1s.length;

            // Landmark check
            const landmarks = document.querySelectorAll(
                'main, [role="main"], nav, [role="navigation"], header, [role="banner"], footer, [role="contentinfo"], aside, [role="complementary"], [role="search"]'
            );
            const hasLandmarks = landmarks.length >= 2; // At least main + one other

            // Title check
            const title = document.title?.trim();
            const hasMeaningfulTitle = title && title.length > 0 && !/^(home|untitled|new tab|document)$/i.test(title);

            const failures = [];
            if (!langValid) failures.push(`lang attribute ${!lang ? 'missing' : `"${lang}" invalid`}`);
            if (h1Count === 0) failures.push('no H1 heading');
            if (h1Count > 1) failures.push(`${h1Count} H1 headings (should be 1)`);
            if (!hasLandmarks) failures.push('fewer than 2 landmark regions');
            if (!hasMeaningfulTitle) failures.push(`page title ${!title ? 'missing' : `"${title}" not descriptive`}`);

            return {
                lang, lang_valid: langValid,
                h1_count: h1Count,
                landmark_count: landmarks.length,
                has_landmarks: hasLandmarks,
                title: title?.slice(0, 60),
                has_title: hasMeaningfulTitle,
                failures
            };
        });

        if (results.failures.length === 0) {
            return {
                status: 'pass',
                wcag_sc,
                points: 1.0,
                reason: 'Page foundation solid — lang valid, single H1, landmarks present, title meaningful',
                evidence: results
            };
        }

        if (results.failures.length === 1) {
            return {
                status: 'partial',
                wcag_sc,
                points: 0.5,
                reason: `Page foundation has 1 issue: ${results.failures[0]}`,
                evidence: results
            };
        }

        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Page foundation failures: ${results.failures.join(', ')}`,
            evidence: results
        };
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc,
            points: 0,
            reason: `Orientation check threw: ${err.message}`,
            evidence: {}
        };
    }
}

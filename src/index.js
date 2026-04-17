import { runTasksForPage, collectFailedSCs } from './task-runner.js';
import { computeJourneyScore } from './scoring.js';

export {
    runTasksForPage,
    computeJourneyScore,
    collectFailedSCs
};

/**
 * Convenience function to run a 1-page scan on a URL and compute the score.
 */
export async function scan(url, pageType = 'home', playwrightPage = null) {
    let browser = null;
    let context = null;
    let page = playwrightPage;

    if (!page) {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        context = await browser.newContext();
        page = await context.newPage();
    }

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const result = await runTasksForPage(page, pageType, url);
        const score = computeJourneyScore([result]);
        return {
            url,
            score,
            pageResult: result
        };
    } finally {
        if (!playwrightPage && browser) {
            await browser.close();
        }
    }
}

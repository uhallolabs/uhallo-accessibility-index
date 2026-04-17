/**
 * Uhallo Task Runner — Scanner v4
 *
 * Runs the appropriate simulation tasks for a given page type.
 * Returns structured task results for the journey scoring module.
 *
 * Page types: 'home' | 'conversion' | 'form'
 *
 * Task weights (must sum to 100 per page type after excluding n/a tasks):
 *   T0 Orientation:         10pt  (all pages)
 *   T1 Keyboard traversal:  20pt  (home, conversion)
 *   T2 Skip link:           10pt  (home, conversion)
 *   T3 Form error handling: 15pt  (form)
 *   T4 Primary action:      15pt  (conversion)
 *   T5 Accessibility tree:  10pt  (all pages)
 *   T6 Image alt quality:   10pt  (home, conversion)
 *   T7 Reflow + touch:      10pt  (home, conversion)
 */

import { run as runT0 } from './tasks/t0-orientation.js';
import { run as runT1 } from './tasks/t1-keyboard-traversal.js';
import { run as runT2 } from './tasks/t2-skip-link.js';
import { run as runT3 } from './tasks/t3-form-error-handling.js';
import { run as runT4 } from './tasks/t4-primary-action.js';
import { run as runT5 } from './tasks/t5-accessibility-tree.js';
import { run as runT6 } from './tasks/t6-image-alt-quality.js';
import { run as runT7 } from './tasks/t7-reflow-touch.js';

// Task definitions with their weights per page type
// weight: points available if applicable; null = not run for this page type
const TASK_DEFINITIONS = [
    { id: 't0', name: 'Orientation',          run: runT0, weights: { home: 10, conversion: 10, form: 10 }, parallel: true },
    { id: 't1', name: 'Keyboard Traversal',   run: runT1, weights: { home: 20, conversion: 20, form: 20 }, parallel: false }, // state-modifying
    { id: 't2', name: 'Skip Link',            run: runT2, weights: { home: 10, conversion: 10, form: null }, parallel: false }, // sequential after T1
    { id: 't3', name: 'Form Error Handling',  run: runT3, weights: { home: null, conversion: null, form: 15 }, parallel: false }, // state-modifying
    { id: 't4', name: 'Primary Action',       run: runT4, weights: { home: null, conversion: 15, form: null }, parallel: false }, // state-modifying
    { id: 't5', name: 'Accessibility Tree',   run: runT5, weights: { home: 10, conversion: 10, form: 10 }, parallel: true },
    { id: 't6', name: 'Image Alt Quality',    run: runT6, weights: { home: 10, conversion: 10, form: null }, parallel: true },
    { id: 't7', name: 'Reflow + Touch',       run: runT7, weights: { home: 10, conversion: 10, form: null }, parallel: false }, // viewport mutation
];

/**
 * Run all applicable tasks for a page.
 *
 * @param {import('playwright').Page} page
 * @param {'home'|'conversion'|'form'} pageType
 * @param {string} url
 * @returns {Promise<{ page_type: string, url: string, page_score: number, tasks: Array }>}
 */
export async function runTasksForPage(page, pageType, url) {
    const applicable = TASK_DEFINITIONS.filter(t => t.weights[pageType] !== null && t.weights[pageType] !== undefined);

    // Separate parallel-safe and sequential tasks
    const parallelTasks = applicable.filter(t => t.parallel);
    const sequentialTasks = applicable.filter(t => !t.parallel);

    const taskResults = {};

    // Run parallel tasks concurrently
    if (parallelTasks.length > 0) {
        const parallelResults = await Promise.allSettled(
            parallelTasks.map(t => runWithGuard(t, page, pageType))
        );
        parallelTasks.forEach((t, i) => {
            taskResults[t.id] = parallelResults[i].status === 'fulfilled'
                ? parallelResults[i].value
                : makeErrorResult(t, parallelResults[i].reason);
        });
    }

    // Run sequential tasks one by one (they mutate page state)
    for (const t of sequentialTasks) {
        taskResults[t.id] = await runWithGuard(t, page, pageType);
    }

    // Compute page score
    const pageScore = computePageScore(taskResults, applicable, pageType);

    return {
        page_type: pageType,
        url,
        page_score: pageScore,
        tasks: applicable.map(t => ({
            id: t.id,
            name: t.name,
            weight: t.weights[pageType],
            ...taskResults[t.id]
        }))
    };
}

/**
 * Run a single task with error guard — never throws.
 */
async function runWithGuard(taskDef, page, pageType) {
    try {
        const result = await taskDef.run(page);
        return result;
    } catch (err) {
        return {
            status: 'fail',
            wcag_sc: [],
            points: 0,
            reason: `Task ${taskDef.id} crashed: ${err.message}`,
            evidence: {}
        };
    }
}

function makeErrorResult(taskDef, reason) {
    return {
        status: 'fail',
        wcag_sc: [],
        points: 0,
        reason: `Task ${taskDef.id} rejected: ${reason?.message || reason}`,
        evidence: {}
    };
}

/**
 * Compute page score from task results.
 *
 * Formula:
 *   page_score = Σ(weight × points_value) / Σ(applicable_weight) × 100
 *
 * n/a tasks are excluded from both numerator and denominator.
 * points: 1.0 = pass, 0.5 = partial, 0.0 = fail
 */
function computePageScore(taskResults, applicable, pageType) {
    let numerator = 0;
    let denominator = 0;

    for (const t of applicable) {
        const result = taskResults[t.id];
        const weight = t.weights[pageType];

        if (!result || result.status === 'n/a') continue; // excluded from scoring

        denominator += weight;
        numerator += weight * (result.points ?? 0);
    }

    if (denominator === 0) return 50; // No applicable tasks — neutral score
    return Math.round((numerator / denominator) * 100);
}

/**
 * Collect all failed WCAG SCs from task results for a page.
 * Returns a Set of SC strings like '2.1.1', '3.3.1'.
 */
export function collectFailedSCs(pageTaskResult) {
    const failed = new Set();
    const passed = new Set();
    for (const t of pageTaskResult.tasks) {
        if (t.status === 'fail' || t.status === 'partial') {
            (t.wcag_sc || []).forEach(sc => failed.add(sc));
        } else if (t.status === 'pass') {
            (t.wcag_sc || []).forEach(sc => passed.add(sc));
        }
    }
    // A SC is failed if it failed on this page (even if it passed elsewhere — per page)
    return { failed, passed };
}

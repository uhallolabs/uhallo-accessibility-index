/**
 * UAI Scoring Algorithm — v4 Journey Engine
 *
 * This file contains computeJourneyScore() and collectFailedSCs().
 * Extracted from the Uhallo Engine monorepo (shared/services/uai-scoring.js, lines 777-903).
 *
 * The v4 engine replaces the pillar-based compression curve (uai-scoring v1.2) with
 * a direct task-completion measurement across 3 role-typed pages.
 *
 * Dependencies:
 *   - task-runner.js (collectFailedSCs is imported from there in the monorepo,
 *     but is co-located here in this standalone extract for simplicity)
 */

// â”€â”€â”€ V4 Journey Scoring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Imported by scanner.js. Kept here so uai-scoring.js is the single scoring module.


const PAGE_WEIGHTS = { home: 0.30, conversion: 0.40, form: 0.30 };
const HIGH_WEIGHT_TASKS = new Set(['t1', 't3', 't4']);
const WEAKEST_LINK_CAP  = 60;

const ALL_TESTED_SCS = new Set([
    '1.1.1', '1.3.1', '1.4.10', '2.1.1', '2.1.2', '2.4.1',
    '2.4.2', '2.4.3', '2.5.5', '3.1.1', '3.3.1', '3.3.3', '4.1.2', '4.1.3',
]);

export function computeJourneyScore(pageResults) {
    if (!pageResults?.length) return _nullScore('No page results');

    const byType = {};
    for (const p of pageResults) {
        if (!byType[p.page_type]) byType[p.page_type] = [];
        byType[p.page_type].push(p);
    }

    const detectedTypes = Object.keys(byType);
    const missingWeight = Object.keys(PAGE_WEIGHTS)
        .filter(t => !byType[t])
        .reduce((s, t) => s + PAGE_WEIGHTS[t], 0);
    const effectiveWeights = { ...PAGE_WEIGHTS };
    if (missingWeight > 0 && detectedTypes.length > 0) {
        const currentTotal = detectedTypes.reduce((s, t) => s + PAGE_WEIGHTS[t], 0);
        for (const t of detectedTypes) effectiveWeights[t] += missingWeight * (PAGE_WEIGHTS[t] / currentTotal);
        for (const t of Object.keys(PAGE_WEIGHTS).filter(t => !byType[t])) effectiveWeights[t] = 0;
    }

    let weightedScore = 0;
    const pageBreakdown = [];
    for (const [type, pages] of Object.entries(byType)) {
        const avg = pages.reduce((s, p) => s + p.page_score, 0) / pages.length;
        weightedScore += effectiveWeights[type] * avg;
        pageBreakdown.push({ page_type: type, page_score: Math.round(avg), effective_weight: effectiveWeights[type], urls: pages.map(p => p.url) });
    }
    let uaiScore = Math.round(weightedScore);

    // Weakest-link floor
    let weakestLinkTriggered = false;
    outer: for (const p of pageResults) {
        for (const t of (p.tasks || [])) {
            if (HIGH_WEIGHT_TASKS.has(t.id) && t.status === 'fail') { weakestLinkTriggered = true; break outer; }
        }
    }
    if (weakestLinkTriggered && uaiScore > WEAKEST_LINK_CAP) uaiScore = WEAKEST_LINK_CAP;

    // Real WCAG SC compliance
    const scFailedOnAnyPage = new Set();
    const scTracker = {};
    for (const sc of ALL_TESTED_SCS) scTracker[sc] = { passed: 0, total: 0 };
    for (const p of pageResults) {
        const { failed, passed } = collectFailedSCs(p);
        for (const sc of failed) { scFailedOnAnyPage.add(sc); if (scTracker[sc]) scTracker[sc].total++; }
        for (const sc of passed) { if (scTracker[sc]) { scTracker[sc].passed++; scTracker[sc].total++; } }
    }
    const passedSCs = [], failedSCs = [];
    for (const [sc, { total }] of Object.entries(scTracker)) {
        if (total === 0) continue;
        (scFailedOnAnyPage.has(sc) ? failedSCs : passedSCs).push(sc);
    }
    const totalTested = passedSCs.length + failedSCs.length;
    const compliancePassRate = totalTested > 0 ? Math.round((passedSCs.length / totalTested) * 100) : 50;

    // Task summary
    const taskMap = {};
    for (const p of pageResults) {
        for (const t of (p.tasks || [])) {
            if (!taskMap[t.id]) taskMap[t.id] = { id: t.id, name: t.name, wcag_sc: t.wcag_sc || [], worst_status: 'pass', pages: [] };
            const entry = taskMap[t.id];
            entry.pages.push({ page_type: p.page_type, status: t.status, reason: t.reason });
            const rank = { fail: 0, partial: 1, pass: 2, 'n/a': 3 };
            if ((rank[t.status] ?? 3) < (rank[entry.worst_status] ?? 3)) {
                entry.worst_status = t.status;
                entry.worst_reason = t.reason;
            }
        }
    }
    const taskSummary = Object.values(taskMap).sort((a, b) => {
        const r = { fail: 0, partial: 1, pass: 2, 'n/a': 3 };
        return (r[a.worst_status] ?? 3) - (r[b.worst_status] ?? 3);
    });

    return {
        uai_score: uaiScore,
        estimated_compliance: compliancePassRate,
        compliance_detail: { passed_scs: passedSCs.sort(), failed_scs: failedSCs.sort(), pass_rate: compliancePassRate, total_tested: totalTested },
        page_breakdown: pageBreakdown,
        task_summary: taskSummary,
        weakest_link_triggered: weakestLinkTriggered,
        scoring_version: 'v4',
    };
}

/**
 * Collect all failed WCAG SCs from task results for a page.
 * Returns a Set of SC strings like '2.1.1', '3.3.1'.
 */
export function collectFailedSCs(pageTaskResult) {
    const failed = new Set();
    const passed = new Set();
    for (const t of (pageTaskResult.tasks || [])) {
        if (t.status === 'fail' || t.status === 'partial') {
            (t.wcag_sc || []).forEach(sc => failed.add(sc));
        } else if (t.status === 'pass') {
            (t.wcag_sc || []).forEach(sc => passed.add(sc));
        }
    }
    // A SC is failed if it failed on this page (even if it passed elsewhere — per page)
    return { failed, passed };
}

export function deriveLegacyPillarScores(journeyScore) {
    const get = (id) => {
        const t = journeyScore.task_summary?.find(t => t.id === id);
        if (!t) return 100;
        return { pass: 100, partial: 65, fail: 20, 'n/a': 100 }[t.worst_status] ?? 100;
    };
    return {
        score_images:    get('t6'),
        score_keyboard:  get('t1'),
        score_focus:     get('t2'),
        score_forms:     get('t3'),
        score_contrast:  100,        // axe contrast not in task suite
        score_headings:  get('t0'),
        score_semantics: get('t5'),
        score_aria:      get('t5'),
    };
}

function _nullScore(reason) {
    return {
        uai_score: 0, estimated_compliance: 0,
        compliance_detail: { passed_scs: [], failed_scs: [], pass_rate: 0, total_tested: 0 },
        page_breakdown: [], task_summary: [], weakest_link_triggered: false,
        scoring_version: 'v4', error: reason,
    };
}


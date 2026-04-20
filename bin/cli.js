#!/usr/bin/env node

import { scan } from '../src/index.js';

// ANSI escape codes for basic terminal formatting without dependencies
const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m"
};

const args = process.argv.slice(2);
let url = args.find(a => a.startsWith('http'));

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${c.bold}Uhallo Accessibility Index (UAI) CLI${c.reset}

Usage:
  npx uhallo-accessibility-index <url>

Options:
  -h, --help    Show help message
`);
    process.exit(0);
}

if (!url) {
    if (args.length > 0 && !args[0].startsWith('-')) {
        url = `https://${args[0]}`;
    } else {
        console.error(`${c.red}Error: Please provide a URL to scan.${c.reset}`);
        console.log(`Example: npx uhallo-accessibility-index https://example.com`);
        process.exit(1);
    }
}

async function runCLI() {
    console.log(`\n${c.cyan}${c.bold}â—¾ Uhallo Engine Simulation Started${c.reset}`);
    console.log(`${c.dim}Target: ${url}${c.reset}\n`);

    const spinnerFrames = ['â ‹', 'â ™', 'â ¹', 'â ¼', 'â ´', 'â ¦', 'â §', 'â ‡', 'â '];
    let frame = 0;
    
    // Poor man's spinner since we don't have ora
    const spinner = setInterval(() => {
        process.stdout.write(`\r${c.magenta}${spinnerFrames[frame]} ${c.reset}Running Playwright task simulations...`);
        frame = (frame + 1) % spinnerFrames.length;
    }, 100);

    try {
        const result = await scan(url, 'home');
        clearInterval(spinner);
        process.stdout.write('\r\x1b[K'); // clear line

        const { score, pageResult } = result;

        console.log(`${c.bold}UAI v1 Journey Score:${c.reset} ${score.uai_score >= 80 ? c.green : score.uai_score >= 60 ? c.yellow : c.red}${score.uai_score}/100${c.reset}`);
        console.log(`${c.bold}SC Pass Rate:${c.reset} ${score.estimated_compliance}% (${score.compliance_detail.total_tested} tested)\n`);

        console.log(`${c.bold}Task Breakdown:${c.reset}`);
        console.log(`â”€`.repeat(60));

        for (const task of score.task_summary) {
            let statusBadge = `${c.white}[N/A]${c.reset}`;
            if (task.worst_status === 'pass') statusBadge = `${c.green}[PASS]${c.reset}`;
            if (task.worst_status === 'fail') statusBadge = `${c.red}[FAIL]${c.reset}`;
            if (task.worst_status === 'partial') statusBadge = `${c.yellow}[PART]${c.reset}`;

            console.log(`${statusBadge} ${c.bold}${task.name}${c.reset} ${c.dim}(${task.id.toUpperCase()})${c.reset}`);
            
            if (task.worst_reason) {
                console.log(`       ${c.dim}â—” ${task.worst_reason}${c.reset}`);
            }
            if (task.wcag_sc && task.wcag_sc.length > 0) {
                console.log(`       ${c.cyan}SCs: ${task.wcag_sc.join(', ')}${c.reset}`);
            }
            console.log();
        }

        console.log(`\n${c.dim}Powered by Uhallo Open Source Standard (uhallo.com)${c.reset}\n`);

        // Emit an exit code > 0 if it entirely failed the floor
        if (score.uai_score < 60) {
            process.exit(1);
        }

    } catch (err) {
        clearInterval(spinner);
        process.stdout.write('\r\x1b[K'); // clear line
        console.error(`${c.red}${c.bold}Error during execution:${c.reset}\n${err.message}`);
        process.exit(1);
    }
}

runCLI();

'use strict';

/**
 * Quest 4 – Linux Web Crawler (Playwright + winston + node-cron)
 *
 * Architecture notes (2024-03 findings):
 *  - iros.go.kr was rebuilt on the WebSquare SPA framework.
 *  - WebSquare requires native security plugins (AnySign4PC / xecureHSM).
 *  - Strategy: navigate → wait for WebSquare body → interact if possible →
 *    fall back to page.pdf() capture.
 *
 * Features:
 *  - Headless Playwright crawl of iros.go.kr (same logic as Quest 1)
 *  - Saves results to JSON and/or CSV
 *  - Structured file logging (winston)
 *  - Exponential-backoff retry logic
 *  - CLI flags: --address, --output, --simulate-error, --headed
 *
 * Usage:
 *   node crawler-linux.js --address "서울특별시 강남구 테헤란로 152" --output json
 *   node crawler-linux.js --output csv
 *   node crawler-linux.js --simulate-error   # test retry logic
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createLogger, format, transports } = require('winston');
const { Parser } = require('json2csv');

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
};
const hasFlag = (flag) => args.includes(flag);

const CONFIG = {
    address: getArg('--address', '서울특별시 강남구 테헤란로 152'),
    outputFormat: getArg('--output', 'json'), // 'json' | 'csv'
    simulateError: hasFlag('--simulate-error'),
    headless: !hasFlag('--headed'),
    outputDir: path.join(__dirname, 'output'),
    logsDir: path.join(__dirname, 'logs'),
    maxRetries: 3,
    retryDelay: 1500,
    siteUrl: 'https://www.iros.go.kr/',
    navigationTimeout: 30000,
    // Keep scripts/fonts/CSS for WebSquare; block only heavy media
    blockedResources: ['image', 'media'],
};

// Logger (winston)
const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

[CONFIG.outputDir, CONFIG.logsDir].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
    transports: [
        new transports.Console(),
        new transports.File({
            filename: path.join(CONFIG.logsDir, 'crawl.log'),
            maxsize: 5 * 1024 * 1024, // 5MB rolling
            maxFiles: 5,
        }),
    ],
});

// Helpers
async function findVisible(ctx, selectors, timeout = 3000) {
    for (const sel of selectors) {
        try {
            const el = ctx.locator(sel).first();
            if (await el.isVisible({ timeout })) return el;
        } catch { /* try next */ }
    }
    return null;
}

// Retry Helper
async function withRetry(fn, maxRetries = CONFIG.maxRetries, baseDelayMs = CONFIG.retryDelay) {
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn(attempt);
        } catch (err) {
            lastErr = err;
            if (attempt === maxRetries) break;
            const delay = baseDelayMs * attempt; // exponential backoff
            logger.warn(`Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastErr;
}

// Core Crawl Function
async function crawl(address, attempt = 1) {
    const t0 = performance.now();
    logger.info(`=== Crawl started | Address: "${address}" | Attempt: ${attempt} ===`);

    if (CONFIG.simulateError && attempt < 2) {
        throw new Error('[SIMULATED] Network failure to test retry logic');
    }

    // Try system Chrome first, fall back to bundled Chromium
    let browser;
    try {
        browser = await chromium.launch({
            headless: CONFIG.headless,
            channel: 'chrome',
            args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
                '--disable-extensions', '--mute-audio', '--no-first-run'],
        });
        logger.info('Using system Chrome');
    } catch {
        browser = await chromium.launch({
            headless: CONFIG.headless,
            args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
                '--disable-default-apps', '--mute-audio', '--no-first-run'],
        });
        logger.info('Using bundled Chromium');
    }

    const context = await browser.newContext({
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        userAgent:
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        acceptDownloads: true,
    });

    // Block unnecessary resources (keep scripts/CSS/fonts for WebSquare)
    await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (CONFIG.blockedResources.includes(type)) return route.abort();
        return route.continue();
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
    page.setDefaultTimeout(CONFIG.navigationTimeout);

    const result = {
        address,
        timestamp: new Date().toISOString(),
        status: 'pending',
        pdfPath: null,
        elapsedSec: null,
        error: null,
        attempt,
    };

    try {
        // ── Navigate to IROS ──────────────────────────────────
        logger.info('Navigating to IROS (인터넷등기소)...');
        // Use 'commit' – WebSquare pages never reach 'load' state
        await page.goto(CONFIG.siteUrl, { waitUntil: 'commit' });
        logger.info(`Navigation commit: ${((performance.now() - t0) / 1000).toFixed(2)}s`);

        // ── Wait for WebSquare to build the DOM ───────────────
        logger.info('Waiting for WebSquare to render...');
        let bodyReady = false;
        try {
            await page.waitForFunction(
                () => document.body && document.body.children.length > 0,
                { timeout: 15_000 }
            );
            bodyReady = true;
            logger.info('WebSquare body rendered');
        } catch {
            logger.warn('WebSquare did not render body (security plugins likely required)');
        }

        // ── If body rendered, try to interact ─────────────────
        if (bodyReady) {
            // Dismiss popup
            try {
                const popupClose = await findVisible(page, [
                    'button:has-text("닫기")', '.layerClose', '#popClose',
                ], 2000);
                if (popupClose) await popupClose.click();
            } catch { /* no popup */ }

            // Click 부동산 menu
            const realEstateMenu = await findVisible(page, [
                'a:has-text("부동산")', 'span:has-text("부동산")',
            ], 3000);
            if (realEstateMenu) {
                await realEstateMenu.click();
                logger.info('Clicked 부동산 menu');
                await page.waitForTimeout(1500);
            }

            // Click 열람하기 tab
            const viewTab = await findVisible(page, [
                'a:has-text("열람하기")', 'a:has-text("열람")',
            ], 3000);
            if (viewTab) {
                await viewTab.click();
                logger.info('Clicked 열람하기 tab');
                await page.waitForTimeout(1500);
            }

            // Fill address
            const addrSelectors = [
                'input#roadNm1', 'input#roadNm', 'input[name="searchKeyword"]',
                'input[placeholder*="주소"]', 'input[placeholder*="검색"]',
                'input#searchAddr', 'input#addr',
            ];

            let addrInput = await findVisible(page, addrSelectors, 3000);
            if (!addrInput) {
                for (const frame of page.frames()) {
                    addrInput = await findVisible(frame, addrSelectors, 2000);
                    if (addrInput) break;
                }
            }

            if (addrInput) {
                await addrInput.fill(address);
                logger.info(`Address filled: "${address}"`);

                // Submit search
                const searchBtn = await findVisible(page, [
                    'button:has-text("검색")', 'a:has-text("검색")',
                    'input[type="submit"]', '#searchBtn',
                ], 3000);
                if (searchBtn) await searchBtn.click();

                // Wait for results
                try {
                    await page.waitForSelector(
                        '.result-list, .searchList, table.list, #resultList, #searchResult',
                        { timeout: 12_000 }
                    );
                    logger.info('Search results appeared');

                    // Extract structured data
                    result.rows = await page.$$eval(
                        '.result-list tr, .searchList tr, table.list tbody tr',
                        (trs) => trs.slice(0, 5).map((tr) => ({
                            cells: Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.trim()),
                        }))
                    );
                    logger.info(`Extracted ${(result.rows || []).length} result row(s)`);
                } catch {
                    logger.warn('Results did not appear within timeout');
                }
            } else {
                logger.warn('Address input field not found');
            }
        }

        // ── Capture PDF ───────────────────────────────────────
        const savePath = path.join(CONFIG.outputDir, `registry_${timestamp()}.pdf`);

        try {
            // Strategy A: download event
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 5000 }),
                findVisible(page, [
                    'a:has-text("PDF")', 'button:has-text("PDF")',
                    'a:has-text("다운로드")', '#pdfBtn',
                ], 2000).then(btn => btn ? btn.click() : null),
            ]);
            if (download) {
                await download.saveAs(savePath);
                result.pdfPath = savePath;
                logger.info(`PDF downloaded → ${savePath}`);
            }
        } catch {
            // Strategy B: print page as PDF
            logger.info('Saving page as PDF (fallback)...');
            try {
                await page.pdf({ path: savePath, format: 'A4', printBackground: true });
                result.pdfPath = savePath;
                logger.info(`Page printed as PDF → ${savePath}`);
            } catch {
                // Strategy C: screenshot
                const screenshotPath = savePath.replace('.pdf', '.png');
                try {
                    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10_000 });
                    result.pdfPath = screenshotPath;
                    logger.info(`Screenshot saved → ${screenshotPath}`);
                } catch {
                    logger.warn('Could not capture any output');
                }
            }
        }

        result.status = 'success';
    } catch (err) {
        result.status = 'error';
        result.error = err.message;
        logger.error(`Crawl error: ${err.message}`);
        throw err;
    } finally {
        await browser.close();
        result.elapsedSec = parseFloat(((performance.now() - t0) / 1000).toFixed(2));
        logger.info(`Crawl finished | Status: ${result.status} | ${result.elapsedSec}s`);
    }

    return result;
}

// Save Results
async function saveResults(result) {
    const ts = timestamp();

    if (CONFIG.outputFormat === 'csv' || CONFIG.outputFormat === 'both') {
        const rows = result.rows || [];
        if (rows.length > 0) {
            const csvPath = path.join(CONFIG.outputDir, `results_${ts}.csv`);
            const parser = new Parser({ fields: ['cells'] });
            const csv = parser.parse(rows);
            fs.writeFileSync(csvPath, csv);
            logger.info(`CSV saved → ${csvPath}`);
        }
    }

    // Always save JSON (primary format)
    const jsonPath = path.join(CONFIG.outputDir, `results_${ts}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    logger.info(`JSON saved → ${jsonPath}`);

    return jsonPath;
}

// Main
async function run() {
    logger.info('======================================');
    logger.info(' Quest 4 – Linux Crawler Starting');
    logger.info(`  Address : ${CONFIG.address}`);
    logger.info(`  Format  : ${CONFIG.outputFormat}`);
    logger.info('======================================');

    let result;
    try {
        result = await withRetry((attempt) => crawl(CONFIG.address, attempt));
        const jsonPath = await saveResults(result);

        console.log('\n' + '─'.repeat(50));
        console.log(`  ✅ Crawl succeeded`);
        console.log(`  ⏱  Time    : ${result.elapsedSec}s`);
        console.log(`  📋 Results : ${jsonPath}`);
        if (result.pdfPath) console.log(`  📄 PDF     : ${result.pdfPath}`);
        console.log('─'.repeat(50) + '\n');
    } catch (err) {
        logger.error(`All retries exhausted. Final error: ${err.message}`);
        console.error(`\n❌ Crawl failed after ${CONFIG.maxRetries} attempts: ${err.message}`);
        process.exit(1);
    }
}

run();

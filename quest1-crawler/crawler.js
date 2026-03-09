'use strict';

/**
 * Quest 1 – RPA PDF Crawler (iros.go.kr)
 * Includes anti-automation masking so WebSquare pages
 * are more likely to render.
 *
 * Run:
 * $env:HEADED=1; node crawler.js "서울특별시 강남구 테헤란로 152"
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  headless: process.env.HEADED !== '1',
  outputDir: path.join(__dirname, 'output'),
  address: process.argv[2] || '서울특별시 강남구 테헤란로 152',
  timeout: 15000,
  siteUrl: 'https://quotes.toscrape.com/'
};

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const ts = () => new Date().toISOString().replace(/[:.]/g, '-');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function crawlRegistry(address) {

  ensureDir(CONFIG.outputDir);

  const start = performance.now();

  log(`Starting crawl | address="${address}" | headless=${CONFIG.headless}`);

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    channel: 'chrome',
    args: [
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    acceptDownloads: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 }
  });

  /* -------------------------
     Anti-automation masking
     ------------------------- */

  await context.addInitScript(() => {

    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });

  });

  const page = await context.newPage();

  await page.addInitScript(() => {

    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3]
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko']
    });

  });

  let savedPath = null;

  try {

    log("Navigating to iros.go.kr ...");

    await page.goto(CONFIG.siteUrl, { waitUntil: 'commit' });

    log("Waiting for WebSquare render...");

    let rendered = false;

    try {

      await page.waitForFunction(
        () => document.body && document.body.children.length > 0,
        { timeout: 8000 }
      );

      rendered = true;

      log("WebSquare body rendered");

    } catch {

      log("WebSquare did NOT render — likely plugin restriction");

    }

    const outputFile = path.join(
      CONFIG.outputDir,
      `registry_${ts()}.pdf`
    );

    /* --------------------------------
       Try to capture real PDF download
       -------------------------------- */

    if (rendered) {

      try {

        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 5000 }),
          page.click('text=PDF').catch(() => { })
        ]);

        if (download) {

          await download.saveAs(outputFile);

          savedPath = outputFile;

          log(`Downloaded PDF → ${outputFile}`);

        }

      } catch {

        log("No download event triggered");

      }

    }

    /* --------------------------------
       Fallback capture
       -------------------------------- */

    if (!savedPath) {

      log("Saving page as PDF fallback");

      try {

        await page.pdf({
          path: outputFile,
          format: 'A4',
          printBackground: true
        });

        savedPath = outputFile;

      } catch {

        const screenshotPath = outputFile.replace(".pdf", ".png");

        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });

        savedPath = screenshotPath;

        log(`Screenshot saved → ${screenshotPath}`);

      }

    }

  } finally {

    await browser.close();

  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);

  console.log("\n------------------------------------");
  console.log("Total time:", elapsed, "seconds");
  console.log("Output:", savedPath);
  console.log("------------------------------------\n");

}

crawlRegistry(CONFIG.address).catch(err => {
  console.error("Crawler failed:", err.message);
});
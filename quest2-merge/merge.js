'use strict';

/**
 * Quest 2 – PDF Merger
 * Merges two PDFs (A + B) into a single output document.
 *
 * Usage:
 *   node merge.js [fileA] [fileB] [output]
 *
 *   Defaults:
 *     fileA  → samples/A.pdf   (10-page document)
 *     fileB  → samples/B.pdf   (3-page document)
 *     output → output/merged.pdf
 */

const { PDFDocument } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

// Config
const ROOT = __dirname;
const DEFAULT_A = process.argv[2] || path.join(ROOT, 'samples', 'A.pdf');
const DEFAULT_B = process.argv[3] || path.join(ROOT, 'samples', 'B.pdf');
const DEFAULT_OUT = process.argv[4] || path.join(ROOT, 'output', 'merged.pdf');

// Merge
async function mergePDFs(fileA, fileB, outputPath) {
    const t0 = performance.now();

    console.log('Loading PDFs...');
    console.log(`   A → ${fileA}`);
    console.log(`   B → ${fileB}`);

    // Validate inputs exist
    for (const f of [fileA, fileB]) {
        if (!fs.existsSync(f)) {
            throw new Error(`File not found: ${f}`);
        }
    }

    // Read both files in parallel for speed
    const [bytesA, bytesB] = await Promise.all([
        fs.promises.readFile(fileA),
        fs.promises.readFile(fileB),
    ]);

    // Load PDF documents in parallel
    const [docA, docB] = await Promise.all([
        PDFDocument.load(bytesA),
        PDFDocument.load(bytesB),
    ]);

    const pagesA = docA.getPageCount();
    const pagesB = docB.getPageCount();
    console.log(`\n Document A: ${pagesA} pages`);
    console.log(` Document B: ${pagesB} pages`);
    console.log(` Expected merged: ${pagesA + pagesB} pages`);

    // Create merged document
    const merged = await PDFDocument.create();

    // Copy pages from A
    const copiedA = await merged.copyPages(docA, docA.getPageIndices());
    copiedA.forEach((p) => merged.addPage(p));

    // Copy pages from B
    const copiedB = await merged.copyPages(docB, docB.getPageIndices());
    copiedB.forEach((p) => merged.addPage(p));

    // Verify
    const finalCount = merged.getPageCount();
    if (finalCount !== pagesA + pagesB) {
        throw new Error(
            `Page count mismatch: expected ${pagesA + pagesB}, got ${finalCount}`
        );
    }

    // Save output
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const mergedBytes = await merged.save();
    await fs.promises.writeFile(outputPath, mergedBytes);

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    console.log('\n' + '─'.repeat(50));
    console.log(`  Merged PDF: ${finalCount} pages`);
    console.log(`  Output   : ${outputPath}`);
    console.log(`  Time     : ${elapsed}s`);
    console.log('─'.repeat(50) + '\n');

    return { outputPath, pages: finalCount, elapsed };
}

// Entry
mergePDFs(DEFAULT_A, DEFAULT_B, DEFAULT_OUT).catch((err) => {
    console.error('\n Merge failed:', err.message);
    console.error('\nUsage: node merge.js [fileA.pdf] [fileB.pdf] [output.pdf]');
    process.exit(1);
});

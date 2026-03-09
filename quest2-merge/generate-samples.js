'use strict';

/**
 * generate-samples.js
 * 
 * Generates placeholder sample PDFs for demonstrating Quest 2 (merge).
 * Creates:
 *   quest2-merge/samples/A.pdf  – 10 pages
 *   quest2-merge/samples/B.pdf  – 3 pages
 *
 * Usage:
 *   node quest2-merge/generate-samples.js
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, 'samples');

async function createSamplePDF(filename, pageCount, color, label) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);

    for (let i = 1; i <= pageCount; i++) {
        const page = doc.addPage([595, 842]); // A4
        const { width, height } = page.getSize();

        // Background
        page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(...color) });

        // Header
        page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(0.1, 0.1, 0.2) });
        page.drawText(`Document ${label} – Page ${i} of ${pageCount}`, {
            x: 40, y: height - 50, size: 24, font, color: rgb(1, 1, 1),
        });

        // Body
        page.drawText(`This is page ${i} of sample document "${label}".`, {
            x: 40, y: height / 2 + 20, size: 16, font, color: rgb(0.1, 0.1, 0.1),
        });
        page.drawText(`Total pages: ${pageCount}`, {
            x: 40, y: height / 2 - 20, size: 14, font, color: rgb(0.3, 0.3, 0.3),
        });

        // Footer
        page.drawText(`Quest 2 Demo | mufin RPA Test`, {
            x: 40, y: 30, size: 10, font, color: rgb(0.5, 0.5, 0.5),
        });
        page.drawText(`Page ${i}`, {
            x: width - 80, y: 30, size: 10, font, color: rgb(0.5, 0.5, 0.5),
        });
    }

    const bytes = await doc.save();
    const outPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outPath, bytes);
    console.log(`Created ${filename} (${pageCount} pages) → ${outPath}`);
    return outPath;
}

async function main() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    await createSamplePDF('A.pdf', 10, [0.95, 0.97, 1.0], 'A');
    await createSamplePDF('B.pdf', 3, [1.0, 0.97, 0.95], 'B');

    console.log('\n Sample PDFs generated in quest2-merge/samples/');
    console.log('   Run: node quest2-merge/merge.js');
}

main().catch(console.error);

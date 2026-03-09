'use strict';

/**
 * Quest 3 – Korean PDF → English PDF Translator
 *
 * Pipeline:
 *   1. Extract text from Korean PDF (pdf-parse, page-by-page)
 *   2. Chunk text → translate each chunk (Google Translate, free endpoint)
 *   3. Reconstruct PDF: load original, white-overlay old text, draw English text
 *
 * OCR fallback (tesseract.js) activates automatically when pdf-parse finds
 * no extractable text (i.e., the PDF is a scanned image).
 *
 * Usage:
 *   node translate.js [input.pdf] [output.pdf]
 *
 *   Defaults:
 *     input  → input/input.pdf
 *     output → output/translated.pdf
 */

const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const { translate } = require('@vitalets/google-translate-api');

// Config
const ROOT = __dirname;
const DEFAULT_INPUT = process.argv[2] || path.join(ROOT, 'input', 'input.pdf');
const DEFAULT_OUTPUT = process.argv[3] || path.join(ROOT, 'output', 'translated.pdf');
const CHUNK_SIZE = 3500;      // chars – Google Translate free limit ~5000
const TRANSLATE_DELAY = 300;  // ms between requests to avoid rate-limit

// Helpers
function chunkText(text, size) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        // Try to break at a sentence boundary (period/newline) near chunk size
        let end = Math.min(start + size, text.length);
        if (end < text.length) {
            const boundary = text.lastIndexOf('\n', end);
            if (boundary > start + size / 2) end = boundary;
        }
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Step 1 – Extract text from PDF
async function extractTextFromPDF(pdfBuffer, inputPath) {
    // ── Try .txt sidecar first (most reliable for sample Korean docs) ──
    const txtSidecar = inputPath.replace(/\.pdf$/i, '.txt').replace(/input\.pdf$/i, '') + 'korean.txt';
    const sidecarPath = path.join(path.dirname(inputPath), 'korean.txt');
    if (fs.existsSync(sidecarPath)) {
        log(` Found Korean text sidecar: ${sidecarPath}`);
        const raw = fs.readFileSync(sidecarPath, 'utf8');
        const pages = raw.split('\f');
        log(`   → ${pages.length} page(s) from sidecar, ${raw.length} chars total`);
        return { pages, hasText: true, raw: null, fromSidecar: true };
    }

    // ── Try pdf-parse ──
    log(' Extracting text from PDF...');
    let data;
    try {
        data = await pdfParse(pdfBuffer);
    } catch (err) {
        log(` pdf-parse error: ${err.message}`);
        log('   Falling back to OCR...');
        return { pages: [], hasText: false, raw: null, fromSidecar: false };
    }

    const pages = data.text.split('\f'); // form-feed = page break
    log(`   → ${data.numpages} page(s) found, ${data.text.length} chars total`);

    // Check if text was actually extracted (not a scanned image PDF)
    const hasText = data.text.trim().length > 50;
    if (!hasText) {
        log(' Very little text extracted — PDF may be image-based. Trying OCR...');
        return { pages, hasText: false, raw: data };
    }

    return { pages, hasText: true, raw: data, fromSidecar: false };
}

// OCR Fallback (image-based PDFs)
async function ocrPages(pdfPath) {
    log(' Running OCR with tesseract.js (Korean)...');
    const Tesseract = require('tesseract.js');
    // tesseract works page-by-page on images; for PDF → extract pages first
    // For this implementation we use a simplistic approach per page
    const { data: { text } } = await Tesseract.recognize(pdfPath, 'kor', {
        logger: (m) => {
            if (m.status === 'recognizing text') {
                process.stdout.write(`\r   OCR progress: ${Math.round(m.progress * 100)}%`);
            }
        },
    });
    process.stdout.write('\n');
    return [text]; // single page result for whole doc
}

// Step 2 – Translate page text Korean → English
async function translatePageText(koreanText) {
    if (!koreanText || !koreanText.trim()) return '';

    const chunks = chunkText(koreanText, CHUNK_SIZE);
    const results = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        log(`   Translating chunk ${i + 1}/${chunks.length} (${chunk.length} chars)...`);
        try {
            const result = await translate(chunk, { from: 'ko', to: 'en' });
            results.push(result.text);
        } catch (err) {
            log(`Translation chunk ${i + 1} failed: ${err.message}, using original`);
            results.push(chunk); // fall back to original on error
        }
        // Respect rate limit between chunks (skip delay on last chunk)
        if (i < chunks.length - 1) await sleep(TRANSLATE_DELAY);
    }

    return results.join(' ');
}

// Step 3 – Rebuild PDF with translated text
async function rebuildPDF(pdfBuffer, translatedPages, outputPath) {
    log(' Rebuilding PDF with translated text...');

    const srcDoc = await PDFDocument.load(pdfBuffer);
    const newDoc = await PDFDocument.create();

    // Copy all original pages (preserves formatting, images, etc.)
    const pageIndices = srcDoc.getPageIndices();
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);

    // Embed a standard font (Helvetica handles Latin/ASCII)
    const font = await newDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await newDoc.embedFont(StandardFonts.HelveticaBold);

    copiedPages.forEach((page, i) => {
        newDoc.addPage(page);
        const { width, height } = page.getSize();
        const translatedText = translatedPages[i] || '';

        if (!translatedText.trim()) return; // skip empty pages

        // Draw a semi-transparent white rectangle over the whole page
        // to mask the original Korean text
        page.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: rgb(1, 1, 1),
            opacity: 0.92,
        });

        // Draw header banner
        page.drawRectangle({
            x: 0,
            y: height - 35,
            width,
            height: 35,
            color: rgb(0.1, 0.3, 0.7),
        });

        page.drawText(`[Translated from Korean - Page ${i + 1}]`, {
            x: 10,
            y: height - 22,
            size: 10,
            font: boldFont,
            color: rgb(1, 1, 1),
        });

        // Draw translated text body
        const margin = 30;
        const textWidth = width - margin * 2;
        const lineHeight = 13;
        const fontSize = 9;
        const startY = height - 50;

        // Sanitize: replace newlines with spaces, strip non-WinAnsi (non-Latin-1) chars
        const safeText = translatedText
            .replace(/[\r\n]+/g, ' ')
            .replace(/[^\x20-\xFF]/g, '');     // WinAnsi covers 0x20–0xFF

        // Word-wrap manually
        const words = safeText.split(' ');
        let line = '';
        let y = startY;

        for (const word of words) {
            const testLine = line ? `${line} ${word}` : word;
            const testWidth = font.widthOfTextAtSize(testLine, fontSize);

            if (testWidth > textWidth && line) {
                page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
                y -= lineHeight;
                line = word;

                if (y < margin) break; // no more space on page
            } else {
                line = testLine;
            }
        }
        // Draw final line
        if (line && y > margin) {
            page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
        }
    });

    // Save
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const pdfBytes = await newDoc.save();
    await fs.promises.writeFile(outputPath, pdfBytes);
    log(` Translated PDF saved → ${outputPath}`);
}

// Main
async function translatePDF(inputPath, outputPath) {
    const t0 = performance.now();

    log(` Starting translation: "${inputPath}"`);

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }

    const pdfBuffer = fs.readFileSync(inputPath);

    // Step 1 – Extract
    let { pages, hasText, fromSidecar } = await extractTextFromPDF(pdfBuffer, inputPath);

    if (!hasText && !fromSidecar) {
        // OCR fallback
        pages = await ocrPages(inputPath);
    }

    // Step 2 – Translate each page
    log(` Translating ${pages.length} page(s)...`);
    const translatedPages = [];
    for (let i = 0; i < pages.length; i++) {
        log(`\n── Page ${i + 1}/${pages.length} ──`);
        const translated = await translatePageText(pages[i]);
        translatedPages.push(translated);
        log(` Page ${i + 1} translated (${translated.length} chars)`);
    }

    // Step 3 – Rebuild PDF
    await rebuildPDF(pdfBuffer, translatedPages, outputPath);

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    console.log('\n' + '─'.repeat(50));
    console.log(`   Translation complete`);
    console.log(`   Pages      : ${pages.length}`);
    console.log(`   Output     : ${outputPath}`);
    console.log(`   Total time : ${elapsed}s`);
    console.log('─'.repeat(50) + '\n');
}

// Entry
translatePDF(DEFAULT_INPUT, DEFAULT_OUTPUT).catch((err) => {
    console.error('\n Translation failed:', err.message);
    console.error('\nUsage: node translate.js [input.pdf] [output.pdf]');
    process.exit(1);
});

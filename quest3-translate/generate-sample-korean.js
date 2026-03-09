'use strict';

/**
 * generate-sample-korean.js
 *
 * Creates a Korean sample PDF for Quest 3 translation demo.
 * Writes two files:
 *   input/input.pdf     – PDF (ASCII-safe placeholder text)
 *   input/korean.txt    – Plain UTF-8 Korean text (translation source)
 *
 * Usage:
 *   node quest3-translate/generate-sample-korean.js
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

const OUTPUT_PATH = path.join(__dirname, 'input', 'input.pdf');
const KOREAN_TXT_PATH = path.join(__dirname, 'input', 'korean.txt');

// Korean text stored as UTF-8 in .txt for reliable extraction
const KOREAN_TEXT_PAGES = [
    `[표제부] 등기사항전부증명서\n\n부동산의 표시\n소재지번: 서울특별시 강남구 테헤란로 152\n건물명칭: 강남파이낸스센터\n용도: 업무시설 (오피스빌딩)\n구조: 철근콘크리트조\n면적: 지하 7층, 지상 44층\n총면적: 125,465.32 제곱미터\n\n이 증명서는 등기기록의 내용과 틀림없음을 증명합니다.\n발급일: 2024년 3월 8일\n대법원 인터넷등기소`,

    `[갑구] 소유권에 관한 사항\n\n순위번호: 1\n등기목적: 소유권보존\n접수: 2005년 8월 15일 제12345호\n등기원인: 2005년 8월 10일 신축\n소유자: 주식회사 강남파이낸스\n주소: 서울특별시 강남구 테헤란로 152\n\n순위번호: 2\n등기목적: 소유권이전\n접수: 2015년 1월 20일 제98765호\n등기원인: 2015년 1월 15일 매매\n소유자: 홍길동\n주소: 서울특별시 서초구 반포대로 201`,

    `[을구] 소유권 이외의 권리에 관한 사항\n\n순위번호: 1\n등기목적: 근저당권설정\n접수: 2015년 1월 20일 제98766호\n채권최고액: 금 오억원정 (500,000,000원)\n채무자: 홍길동\n근저당권자: 국민은행 주식회사\n서울특별시 영등포구 국제금융로 8\n\n이 등기부는 위와 같이 기재되어 있음을 증명합니다.\n등기관: 서울중앙지방법원 등기국`,
];

async function main() {
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // ── Write UTF-8 Korean text sidecar (reliable extraction source) ──
    const koreanAll = KOREAN_TEXT_PAGES.join('\f'); // \f = form-feed page separator
    fs.writeFileSync(KOREAN_TXT_PATH, koreanAll, 'utf8');
    console.log(` Korean text file created → ${KOREAN_TXT_PATH}`);

    // ── Build PDF with ASCII-safe visible content ──
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    for (let i = 0; i < KOREAN_TEXT_PAGES.length; i++) {
        const page = doc.addPage([595, 842]);
        const { width, height } = page.getSize();

        // Header
        page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: rgb(0.1, 0.2, 0.5) });
        page.drawText('Korean Property Registry Document (Sample)', {
            x: 20, y: height - 38, size: 13, font: boldFont, color: rgb(1, 1, 1),
        });
        page.drawText(`Page ${i + 1} of ${KOREAN_TEXT_PAGES.length}`, {
            x: width - 100, y: height - 38, size: 11, font, color: rgb(0.8, 0.8, 0.8),
        });

        // Body – replace Korean (non-ASCII) with '?' since pdf-lib uses WinAnsi encoding
        const lines = KOREAN_TEXT_PAGES[i].split('\n');
        let y = height - 80;
        for (const line of lines) {
            if (y < 40) break;
            const size = line.startsWith('[') ? 12 : 10;
            const usedFont = line.startsWith('[') ? boldFont : font;
            page.drawText(line.replace(/[^\x20-\x7E]/g, '?'), {
                x: 30, y, size, font: usedFont, color: rgb(0, 0, 0),
            });
            y -= (size + 4);
        }

        // Footer
        page.drawText('Sample Korean PDF - See input/korean.txt for full Korean text', {
            x: 30, y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.5),
        });
    }

    const bytes = await doc.save();
    fs.writeFileSync(OUTPUT_PATH, bytes);
    console.log(` Korean sample PDF created → ${OUTPUT_PATH}`);
    console.log(`   ${KOREAN_TEXT_PAGES.length} pages`);
    console.log('\n For a real Korean PDF from iros.go.kr, replace input/input.pdf');
    console.log('   Run: node quest3-translate/translate.js');
}

main().catch(console.error);


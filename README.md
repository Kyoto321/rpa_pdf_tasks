# RPA & PDF Processing Tasks

> **Company**: mufin.co.kr — Korean FinTech  
> **Stack**: Node.js 18+ · Playwright · pdf-lib · pdf-parse · Google Translate  
> **Platform**: Windows (Quests 1–3) · Linux/WSL2 (Quest 4)

---

## Quick Start

```bash
# 1. Clone and install
git clone <your-repo-url>
cd rpa-pdf-tasks
npm install

# 2. Install Playwright browser
npx playwright install chromium

# 3. Copy and configure environment
cp .env.example .env
```

---

## Quest 1 — RPA PDF Crawler (Windows) ⭐⭐⭐

**Goal**: Automate extraction of Korean property registry PDFs from [iros.go.kr](https://www.iros.go.kr) in **≤16 seconds** (stretch: ≤8s).

### How It Works
1. Launches headless Chromium via Playwright
2. Navigates directly to the IROS search endpoint (bypassing home page)
3. Blocks images/fonts/CSS to dramatically reduce load time
4. Searches by address → selects first result → captures PDF download
5. Falls back to `page.pdf()` if no download event fires

### Run
```bash
node quest1-crawler/crawler.js "서울특별시 강남구 테헤란로 152"

# Headed mode (shows the browser – useful for debugging selectors)
set HEADED=1 && node quest1-crawler/crawler.js "서울특별시 강남구 테헤란로 152"
```

### Output
- PDF saved to `quest1-crawler/output/registry_<timestamp>.pdf`
- Console prints total elapsed time and PASS/FAIL status

### Performance Optimisations Applied
| Technique | Saving |
|---|---|
| Block images / CSS / fonts | ~2–3s |
| `waitUntil: 'domcontentloaded'` | ~1–2s |
| Jump directly to search URL | ~2s |
| Headless + `--disable-gpu` | ~0.5s |

> **Note**: CSS selectors for iros.go.kr must be confirmed on first run in headed mode. The site may show a CAPTCHA or login prompt; update selectors accordingly.

---

## Quest 2 — Merge PDFs ⭐

**Goal**: Merge a 10-page PDF (A) and 3-page PDF (B) into a single 13-page document.

### Run
```bash
# Generate demo sample PDFs first (if you don't have real ones)
node quest2-merge/generate-samples.js

# Merge
node quest2-merge/merge.js

# Custom files
node quest2-merge/merge.js path/to/A.pdf path/to/B.pdf path/to/output.pdf
```

### Output
- Merged PDF saved to `quest2-merge/output/merged.pdf`
- Console confirms exact page count

---

## Quest 3 — Translate Korean PDF → English ⭐⭐⭐

**Goal**: Extract Korean text from a PDF → translate to English via Google Translate → overlay translated text back into the PDF.

### Run
```bash
# Generate a sample Korean PDF for demo
node quest3-translate/generate-sample-korean.js

# Translate (uses input/input.pdf by default)
node quest3-translate/translate.js

# Custom files
node quest3-translate/translate.js input.pdf output.pdf
```

### Pipeline
```
input.pdf
  → [pdf-parse]  Extract text per page
  → [chunked]    Split into ≤3500-char chunks
  → [translate]  Korean → English via Google Translate free API
  → [pdf-lib]    White overlay + draw English text onto pages
  → output/translated.pdf
```

### Notes
- For **scanned/image PDFs**, the script automatically falls back to **Tesseract.js OCR** (Korean language pack)
- For high-volume production use, replace `@vitalets/google-translate-api` with the official **Google Cloud Translation API v3** (requires billing)

---

## Quest 4 — Linux Crawler ⭐⭐⭐⭐

**Goal**: Same crawler as Quest 1, but running on **Linux** with:
- Structured logging (winston)
- Exponential-backoff retry (3 attempts)
- JSON + CSV output
- Hourly cron scheduling

### Setup on Linux / WSL2
```bash
# Install Playwright Linux dependencies
npx playwright install-deps chromium

# (Optional) Make shell script executable
chmod +x quest4-linux/scheduler.sh
```

### Run (one-shot)
```bash
node quest4-linux/crawler-linux.js --address "서울특별시 강남구 테헤란로 152" --output json

# CSV output
node quest4-linux/crawler-linux.js --output csv

# Test retry logic
node quest4-linux/crawler-linux.js --simulate-error
```

### Run as Scheduled Service (Node)
```bash
# Runs the crawler every hour (configurable via CRON_SCHEDULE env var)
node quest4-linux/scheduler.js
```

### Add to System Cron
```bash
# Edit crontab
crontab -e

# Add this line (adjust path):
0 * * * * /absolute/path/to/rpa-pdf-tasks/quest4-linux/scheduler.sh
```

### Output
| File | Description |
|---|---|
| `quest4-linux/output/results_<ts>.json` | Structured crawl result |
| `quest4-linux/output/results_<ts>.csv` | CSV version of result rows |
| `quest4-linux/output/registry_<ts>.pdf` | Downloaded registry PDF |
| `quest4-linux/logs/crawl.log` | Winston log file |
| `quest4-linux/logs/cron.log` | Cron wrapper log |

---

## Project Structure

```
rpa-pdf-tasks/
├── package.json
├── .env.example              ← copy to .env
├── .gitignore
├── quest1-crawler/
│   ├── crawler.js            ← Main RPA script (Windows)
│   └── output/               ← Downloaded PDFs
├── quest2-merge/
│   ├── merge.js              ← PDF merger
│   ├── generate-samples.js   ← Creates demo A.pdf + B.pdf
│   ├── samples/              ← Input PDFs (A.pdf, B.pdf)
│   └── output/               ← merged.pdf
├── quest3-translate/
│   ├── translate.js          ← Translation pipeline
│   ├── generate-sample-korean.js
│   ├── input/                ← Put your Korean PDF here
│   └── output/               ← translated.pdf
└── quest4-linux/
    ├── crawler-linux.js      ← Linux crawler with retries
    ├── scheduler.js          ← node-cron scheduler
    ├── scheduler.sh          ← Bash cron wrapper
    ├── output/
    └── logs/
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Selectors not found on iros.go.kr | Run in headed mode (`HEADED=1`) and use DevTools to find correct selectors |
| Google Translate rate limit | Add delay or switch to Cloud Translation API |
| Playwright fails on Linux | Run `npx playwright install-deps chromium` |
| Korean text shows as `?` in sample PDF | Expected — pdf-lib requires a CJK font; real iros.go.kr PDFs have embedded fonts |
| Crawl > 16s | Check network speed; increase resource-blocking; skip non-critical waits |

---

## Deliverables Checklist

- [x] Quest 1: RPA Crawler script
- [x] Quest 2: PDF Merge script
- [x] Quest 3: Translation script
- [x] Quest 4: Linux Crawler + cron
- [ ] Loom video (record separately)
- [ ] Push to GitHub
- [ ] Email to recruiting@mufin.co.kr

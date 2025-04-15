const puppeteer = require("puppeteer");

// === CONFIGURATION ===
const baseSceneId = "4982a248-4a32-4f29-ac94-73a2d2af790c";
const totalLines = 100; // total lines to process
// const startFromLineId = 0; // starting line id
// const endLineId = 0; // ending line id
const r = 2; // range size (lines per scene)
const c = 2; // concurrent browsers per wave, 4 doesn't work on my good mac
// const w = 2; // number of waves (runs c * w total)
const headless = true; // set to true for production
const delayBetweenWavesMs = 3000;
const targetLogMessage = "<<Close Virtual Browser>>";

// === HELPERS ===
function chunkRanges(start, end, chunkSize) {
  const chunks = [];
  for (let i = start; i <= end; i += chunkSize) {
    chunks.push([i, Math.min(i + chunkSize - 1, end)]);
  }
  return chunks;
}

async function runScene(start, end) {
  const browser = await puppeteer.launch({ headless, defaultViewport: null });
  const page = await browser.newPage();
  const url = `http://localhost:3000/courtroom/${baseSceneId}?start=${start}&end=${end}`;

  console.log(`🎥 Visiting: ${url}`);

  const waitForLog = new Promise((resolve) => {
    page.on("console", (msg) => {
      const text = msg.text();
      console.log(`[Console] ${text}`);
      if (text.trim() === targetLogMessage) {
        resolve();
      }
    });
  });

  await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });

  const { width, height } = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  await page.mouse.click(width / 2, height / 2);
  await page.keyboard.press("Enter");

  await waitForLog;
  console.log(`✅ Finished range ${start}-${end}`);

  await browser.close();
}

// === MAIN EXECUTION ===
(async () => {
  const allChunks = chunkRanges(0, totalLines - 1, r);
  const totalChunks = allChunks.length;
  const batchSize = c;
  let batchIndex = 0;

  while (batchIndex < totalChunks) {
    const currentBatch = allChunks.slice(batchIndex, batchIndex + batchSize);
    console.log(`🚀 Starting batch ${batchIndex / batchSize + 1}`);

    await Promise.all(currentBatch.map(([start, end]) => runScene(start, end)));

    batchIndex += batchSize;

    if (batchIndex < totalChunks) {
      console.log(
        `⏳ Waiting ${delayBetweenWavesMs / 1000}s before next wave...`
      );
      await new Promise((res) => setTimeout(res, delayBetweenWavesMs));
    }
  }

  console.log("🏁 All scenes completed.");
})();

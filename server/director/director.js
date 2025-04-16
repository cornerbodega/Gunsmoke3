const puppeteer = require("puppeteer");

// === CONFIGURATION ===
const baseSceneId = "160eeb60-0e31-42a4-9f27-6fe2f16dbed3";
const totalLines = 4794; // Total lines in the scene
const startFromLineId = 0; // Where to begin (inclusive)
const endLineId = null; // Where to stop (inclusive), null = end at last

const c = 2; // Number of concurrent browser instances per wave
const headless = true; // Set to false for debugging
const delayBetweenWavesMs = 500; // Delay between waves (ms)
const targetLogMessage = "<<Close Virtual Browser>>"; // Message to wait for before closing browser

// === CALCULATED VALUES ===
const start = startFromLineId ?? 0;
const end = endLineId ?? totalLines - 1;
const r = Math.ceil((end - start + 1) / c); // Dynamic chunk size based on concurrency

// === HELPERS ===

// Split a start-end range into chunks of size `chunkSize`
function chunkRanges(start, end, chunkSize) {
  const chunks = [];
  for (let i = start; i <= end; i += chunkSize) {
    chunks.push([i, Math.min(i + chunkSize - 1, end)]);
  }
  return chunks;
}

// Launch a browser to record a given line range
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

  // Open the page and simulate interaction to trigger playback
  await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });

  const { width, height } = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  await page.mouse.click(width / 2, height / 2); // Required to unlock audio
  await page.keyboard.press("Enter"); // Starts playback

  await waitForLog;
  console.log(`✅ Finished range ${start}-${end}`);
  await browser.close();
}

// === MAIN EXECUTION ===
(async () => {
  const allChunks = chunkRanges(start, end, r);
  const totalChunks = allChunks.length;
  const batchSize = c;
  let batchIndex = 0;

  // Preflight logs
  console.log(`📦 Total lines: ${end - start + 1}`);
  console.log(`🚀 Launching with concurrency: ${c}`);
  console.log(`📊 Chunk size (r): ${r}`);
  console.log(`🧩 Total chunks: ${totalChunks}`);

  // Loop over each batch of concurrent runs
  while (batchIndex < totalChunks) {
    const currentBatch = allChunks.slice(batchIndex, batchIndex + batchSize);
    console.log(`🔁 Starting batch ${Math.floor(batchIndex / batchSize) + 1}`);

    await Promise.all(
      currentBatch.map(async ([start, end]) => {
        try {
          await runScene(start, end);
        } catch (err) {
          console.error(`❌ Failed range ${start}-${end}:`, err);
        }
      })
    );

    batchIndex += batchSize;

    if (batchIndex < totalChunks) {
      console.log(`⏳ Waiting ${delayBetweenWavesMs}ms before next batch...`);
      await new Promise((res) => setTimeout(res, delayBetweenWavesMs));
    }
  }

  console.log("🏁 All scenes completed.");
})();

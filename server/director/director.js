const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// === CONFIGURATION ===
const baseSceneId = "160eeb60-0e31-42a4-9f27-6fe2f16dbed3";
const folderName = "alameda";
const outputDir = path.resolve(
  __dirname,
  `../videos/${folderName}-${baseSceneId}`
);

const c = 1;
const headless = true;
const delayBetweenWavesMs = 500;
const targetLogMessage = "<<Close Virtual Browser>>";

// === Supabase Setup ===
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// === HELPERS ===
function getExistingLineNumbers() {
  if (!fs.existsSync(outputDir)) return new Set();
  return new Set(
    fs
      .readdirSync(outputDir)
      .map((f) => parseInt(f))
      .filter((n) => !isNaN(n))
  );
}

async function fetchValidLineIds(sceneId) {
  const pageSize = 1000;
  let from = 0;
  let all = [];

  while (true) {
    const { data, error } = await supabase
      .from("gs3_lines")
      .select("line_id")
      .eq("scene_id", sceneId)
      .order("line_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...data.map((d) => d.line_id));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return new Set([0, ...all]); // Always include intro line 0
}

function groupConsecutiveRanges(lineIds) {
  if (lineIds.length === 0) return [];
  lineIds.sort((a, b) => a - b);
  const ranges = [];
  let start = lineIds[0];
  let end = lineIds[0];

  for (let i = 1; i < lineIds.length; i++) {
    if (lineIds[i] === end + 1) {
      end = lineIds[i];
    } else {
      ranges.push([start, end]);
      start = end = lineIds[i];
    }
  }

  ranges.push([start, end]);
  return ranges;
}

async function runScene(
  start,
  end,
  index,
  totalChunks,
  totalLinesMissing,
  linesRenderedSoFar
) {
  const lineCount = end - start + 1;
  const url = `http://localhost:3000/courtroom/${baseSceneId}?start=${start}&end=${end}&folderName=${folderName}`;
  const browser = await puppeteer.launch({ headless, defaultViewport: null });
  const page = await browser.newPage();
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

  const totalPercent = (
    ((linesRenderedSoFar + lineCount) / totalLinesMissing) *
    100
  ).toFixed(2);
  const batchPercent = (((index + 1) / totalChunks) * 100).toFixed(2);

  console.log(
    `✅ Finished ${start}-${end} (${lineCount} lines) | ${totalPercent}% total, ${batchPercent}% of current batch`
  );

  await browser.close();
}

// === MAIN ===
(async () => {
  console.log("📦 Fetching valid lines from Supabase...");
  const validLines = await fetchValidLineIds(baseSceneId);
  const renderedLines = getExistingLineNumbers();

  const missingLines = [...validLines].filter((id) => !renderedLines.has(id));
  if (missingLines.length === 0) {
    console.log("🎉 All line outputs exist. Nothing to do!");
    return;
  }

  const missingRanges = groupConsecutiveRanges(missingLines);
  const totalChunks = missingRanges.length;

  const totalLinesMissing = missingRanges.reduce(
    (sum, [start, end]) => sum + (end - start + 1),
    0
  );
  let linesRenderedSoFar = 0;

  console.log(`📁 Output: ${outputDir}`);
  console.log(`❌ Missing ranges: ${totalChunks}`);
  console.log(`📉 Total missing lines: ${totalLinesMissing}`);
  console.log(`🚀 Concurrency: ${c}`);
  console.log("===================================");

  let batchIndex = 0;
  while (batchIndex < totalChunks) {
    const currentBatch = missingRanges.slice(batchIndex, batchIndex + c);
    const batchNumber = Math.floor(batchIndex / c) + 1;
    const totalBatches = Math.ceil(totalChunks / c);

    console.log(`🔁 Starting batch ${batchNumber} of ${totalBatches}`);

    await Promise.all(
      currentBatch.map(async ([start, end], i) => {
        try {
          await runScene(
            start,
            end,
            batchIndex + i,
            totalChunks,
            totalLinesMissing,
            linesRenderedSoFar
          );
          linesRenderedSoFar += end - start + 1;
        } catch (err) {
          console.error(`❌ Failed range ${start}-${end}:`, err);
        }
      })
    );

    batchIndex += c;

    if (batchIndex < totalChunks) {
      console.log(`⏳ Waiting ${delayBetweenWavesMs}ms before next batch...`);
      await new Promise((res) => setTimeout(res, delayBetweenWavesMs));
    }
  }

  console.log("🏁 All missing scenes rendered.");
})();

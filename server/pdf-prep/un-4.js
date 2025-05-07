const fs = require("fs");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");
const { createCanvas } = require("canvas");
const Tesseract = require("tesseract.js");

async function renderPdfPageToImage(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  const renderContext = {
    canvasContext: context,
    viewport,
  };

  await page.render(renderContext).promise;
  return canvas.toBuffer("image/png");
}

async function runOcr(buffer) {
  const result = await Tesseract.recognize(buffer, "eng", {
    logger: (m) => process.stdout.write(`📖 OCR: ${m.status}\r`),
  });
  return result.data.text;
}

async function splitAndAddToPdf(imageBuffer, pdfDoc, ocrResults, pageIndex) {
  const metadata = await sharp(imageBuffer).metadata();
  const w = Math.floor(metadata.width / 2);
  const h = Math.floor(metadata.height / 2);

  const positions = [
    { left: 0, top: 0 }, // Top-Left
    { left: 0, top: h }, // Bottom-Left
    { left: w, top: 0 }, // Top-Right
    { left: w, top: h }, // Bottom-Right
  ];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const sliceBuffer = await sharp(imageBuffer)
      .extract({ left: pos.left, top: pos.top, width: w, height: h })
      .png()
      .toBuffer();

    // OCR the slice
    const text = await runOcr(sliceBuffer);
    const logicalPageNumber = pageIndex * 4 + i + 1;
    ocrResults.push({ page: logicalPageNumber, text });

    // Add to PDF
    const imgEmbed = await pdfDoc.embedPng(sliceBuffer);
    const page = pdfDoc.addPage([w, h]);
    page.drawImage(imgEmbed, { x: 0, y: 0, width: w, height: h });
  }
}

(async () => {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js");
  const getDocument = pdfjsLib.default.getDocument;

  async function expandPdfWithOcr(inputPath, outputPdfPath, outputTextPath) {
    const data = new Uint8Array(fs.readFileSync(inputPath));
    const pdf = await getDocument({ data }).promise;
    console.log(`📄 Total input pages: ${pdf.numPages}`);

    const newPdf = await PDFDocument.create();
    const ocrResults = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const imgBuffer = await renderPdfPageToImage(page);
        await splitAndAddToPdf(imgBuffer, newPdf, ocrResults, i - 1);
        console.log(`✅ Processed original page ${i}`);
      } catch (err) {
        console.error(`❌ Failed on page ${i}:`, err.message);
      }
    }

    // Save the new visual PDF
    const pdfBytes = await newPdf.save();
    fs.writeFileSync(outputPdfPath, pdfBytes);
    console.log(`📄 Saved expanded PDF: ${outputPdfPath}`);

    // Save OCR text
    const combinedText = ocrResults
      .map(({ page, text }) => `--- Page ${page} ---\n${text.trim()}`)
      .join("\n\n");

    fs.writeFileSync(outputTextPath, combinedText, "utf8");
    console.log(`📝 Saved OCR transcript: ${outputTextPath}`);
  }

  await expandPdfWithOcr(
    // "Day-01-Transcript-Depp-v-NGN-7-July-2020.pdf",
    // "Un-4-Day-01-Transcript-Depp-v-NGN-7-July-2020.pdf",
    // "Un-4-Day-01-OCR.txt"
    "Day-02-Transcript-Depp-v-NGN-8-July-2020.pdf",
    "Un-4-Day-02-Transcript-Depp-v-NGN-8-July-2020.pdf",
    "Un-4-Day-02-OCR.txt"
  );
})();

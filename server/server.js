const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cors = require("cors");
const fs = require("fs");

const app = express();
const port = 3001;

app.use(cors());

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB limit
});

/**
 * Character-based chunking with overlap.
 *
 * @param {string} text - Full text to split
 * @param {number} maxChars - Max chars per chunk (e.g., 7000)
 * @param {number} overlap - Overlap between chunks (e.g., 500)
 * @returns {string[]} Array of chunked text
 */
function splitTextByChars(text, maxChars = 7000, overlap = 500) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    const end = Math.min(i + maxChars, text.length);
    chunks.push(text.slice(i, end));
    i += maxChars - overlap;
  }

  return chunks;
}

app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Split into character chunks with some overlap
    const chunks = splitTextByChars(parsed.text, 7000, 500);

    res.json({
      chunks, // The actual text chunks
      chunkCount: chunks.length,
      numpages: parsed.numpages,
      info: parsed.info,
    });
  } catch (err) {
    console.error("PDF parsing error:", err);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
});

app.listen(port, () => {
  console.log(`✅ PDF parser server running on http://localhost:${port}`);
});
